#include <xxh3.h>

#include <cerrno>
#include <cstdlib>
#include <cstring>
#include <error.hpp>
#include <io/file.hpp>
#include <log.hpp>
#include <wad/archive.hpp>
#include <numeric>
#include <unordered_map>
#include <vector>

#include <fcntl.h>
#include <sys/stat.h>
#include <unistd.h>
#ifdef __APPLE__
#    include <sys/attr.h>
#    include <sys/clonefile.h>
#endif

using namespace lol;
using namespace lol::wad;

auto Archive::read_from_toc(io::Bytes src, TOC const& toc) -> Archive {
    lol_trace_func(lol_trace_var("{}", toc.entries.size()));
    auto descriptors_by_checksum = std::unordered_map<std::uint64_t, EntryData>{};
    descriptors_by_checksum.reserve(toc.entries.size());
    auto archive = Archive{};
    for (auto const& entry : toc.entries) {
        if (entry.loc.checksum) {
            if (auto old = descriptors_by_checksum.find(entry.loc.checksum); old != descriptors_by_checksum.end()) {
                archive.entries[entry.name] = old->second;
                continue;
            }
        }
        auto data = EntryData::from_loc(src, entry.loc);
        archive.entries[entry.name] = data;
        if (entry.loc.checksum) {
            descriptors_by_checksum[entry.loc.checksum] = data;
        }
    }
    archive.signature = toc.signature;
    return archive;
}

auto Archive::read_from_file(fs::path const& path) -> Archive {
    lol_trace_func(lol_trace_var("{}", path));
    auto src = io::Bytes::from_file(path);
    auto toc = TOC{};
    auto const toc_error = toc.read(src);
    lol_throw_if(toc_error);
    return read_from_toc(src, toc);
}

auto Archive::pack_from_directory(fs::path const& dir) -> Archive {
    lol_trace_func(lol_trace_var("{}", dir));
    auto archive = Archive{};
    for (auto const& dirent : fs::recursive_directory_iterator(dir)) {
        if (!dirent.is_regular_file()) continue;
        archive.add_from_directory(dirent.path(), dir);
    }
    return archive;
}

auto Archive::add_from_directory(fs::path const& path, fs::path const& dir) -> void {
    lol_trace_func(lol_trace_var("{}", path), lol_trace_var("{}", dir));
    auto name = hash::Xxh64::from_path(fs::relative(path, dir));
    auto data = EntryData::from_file(path);
    entries.insert_or_assign(name, data);
}

auto Archive::estimate_size() const noexcept -> std::size_t {
    auto estimate = sizeof(TOC::latest_header_t) + sizeof(TOC::latest_entry_t) * entries.size();
    for (auto const& [name, data] : entries) {
        estimate += data.bytes_size();
    }
    return estimate;
}

// True when both paths name the same existing file (same device and inode, links followed).
static auto is_same_file(fs::path const& a, fs::path const& b) noexcept -> bool {
    struct ::stat sa = {}, sb = {};
    if (::stat(a.c_str(), &sa) != 0 || ::stat(b.c_str(), &sb) != 0) return false;
    return sa.st_dev == sb.st_dev && sa.st_ino == sb.st_ino;
}

static auto pwrite_all(int fd, void const* data, std::size_t size, std::uint64_t offset) -> void {
    auto cur = (char const*)data;
    while (size) {
        auto const n = ::pwrite(fd, cur, size, (off_t)offset);
        if (n < 0 && errno == EINTR) continue;
        lol_throw_if_msg(n <= 0, "pwrite failed: {}", std::strerror(errno));
        cur += n;
        size -= (std::size_t)n;
        offset += (std::uint64_t)n;
    }
}

// Writes the overlay copy of a game WAD as an APFS clone of the game's own file: the clone shares
// every block with the original, then only the TOC entries this overlay changes are rewritten in
// place and their data appended after the original data. Copy-on-write keeps the game's file
// untouched (it is never opened for writing), and the overlay costs the mod's bytes instead of the
// WAD's size. Returns false, having written nothing, when the WAD can't be done this way (another
// volume or file system, or a TOC whose entries differ from the game's); the caller then copies.
auto Archive::write_cloned(fs::path const& path, TOC::latest_header_t const& header) const -> bool {
#ifndef __APPLE__
    return false;
#else
    using HeaderT = TOC::latest_header_t;
    using EntryT = TOC::latest_entry_t;
    lol_trace_func(lol_trace_var("{}", path), lol_trace_var("{}", source_path));

    // Not a single byte is written below unless it lands in a file of our own.
    auto const tmp = fs::path(path.generic_string() + ".zushi-clone");
    lol_throw_if_msg(is_same_file(tmp, source_path), "Refusing to write to the game's WAD: {}", tmp);

    if (auto existing = HeaderT{}; fs::exists(path)) {
        auto const bytes = io::Bytes::from_file(path);
        if (bytes.size() >= sizeof(HeaderT)) {
            std::memcpy(&existing, bytes.data(), sizeof(HeaderT));
            if (std::memcmp(&existing, &header, sizeof(HeaderT)) == 0) return true;
        }
    }

    fs::create_directories(path.parent_path());
    {
        // A leftover from an interrupted build: only ever a clone we made in the overlay.
        std::error_code ec = {};
        fs::remove(tmp, ec);
    }
#    ifdef CLONE_NOOWNERCOPY
    constexpr auto clone_flags = CLONE_NOFOLLOW | CLONE_NOOWNERCOPY;
#    else
    constexpr auto clone_flags = CLONE_NOFOLLOW;
#    endif
    if (::clonefile(source_path.c_str(), tmp.c_str(), clone_flags) != 0) {
        logi("Can't clone {} ({}), copying it instead", source_path, std::strerror(errno));
        return false;
    }
    struct RemoveOnExit {
        fs::path path;
        bool armed = true;
        ~RemoveOnExit() {
            if (!armed) return;
            std::error_code ec = {};
            fs::remove(path, ec);
        }
    } remove_tmp{tmp};
    lol_throw_if_msg(is_same_file(tmp, source_path), "Clone of {} is the game's own file", source_path);

    // Read the TOC from the clone itself: those are exactly the bytes about to be patched.
    auto toc = TOC{};
    auto clone_size = std::uint64_t{};
    {
        auto const bytes = io::Bytes::from_file(tmp);
        if (auto const error = toc.read(bytes)) {
            logw("Can't read the TOC of {} ({}), copying it instead", source_path, error);
            return false;
        }
        clone_size = bytes.size();
    }
    // Same entry count and names: then entry i of the TOC is entry i of this archive (both sorted
    // by name), every TOC slot stays where it is, and the original data never has to move.
    if (toc.version != TOC::Version::latest() || toc.entries.size() != entries.size()) {
        return false;
    }
    auto changed = std::vector<std::pair<std::size_t, EntryData>>{};
    {
        auto it = entries.begin();
        for (std::size_t i = 0; i != toc.entries.size(); ++i, ++it) {
            auto const& orig = toc.entries[i];
            if (orig.name != it->first) return false;
            auto const& data = it->second;
            // Same bytes as the game's entry: keep the game's TOC entry verbatim. Its subchunk
            // fields are deliberately not compared: read_from_toc shares one EntryData between
            // entries with equal bytes, so those carry the first one's subchunk index, while the
            // game's own entry holds the right one for its SubChunkTOC.
            auto const unchanged = orig.loc.checksum != 0 && data.type() == orig.loc.type &&
                                   data.bytes_size() == orig.loc.size &&
                                   data.size_decompressed() == orig.loc.size_decompressed &&
                                   data.checksum() == orig.loc.checksum;
            if (!unchanged) changed.emplace_back(i, data.into_optimal());
        }
    }

    auto const fd = ::open(tmp.c_str(), O_RDWR | O_NOFOLLOW);
    if (fd < 0) {
        logi("Can't open the clone of {} ({}), copying it instead", source_path, std::strerror(errno));
        return false;
    }
    struct CloseOnExit {
        int fd;
        ~CloseOnExit() { ::close(fd); }
    } close_fd{fd};
    {
        struct ::stat sf = {}, ss = {};
        lol_throw_if(::fstat(fd, &sf) != 0 || ::stat(source_path.c_str(), &ss) != 0);
        lol_throw_if_msg(sf.st_dev == ss.st_dev && sf.st_ino == ss.st_ino,
                         "Refusing to write to the game's WAD: {}",
                         source_path);
    }

    // Same layout as the full write: entries sharing a checksum share their bytes.
    auto loc_by_checksum = std::unordered_map<std::uint64_t, EntryLoc>{};
    auto patches = std::vector<std::pair<std::size_t, EntryT>>{};
    patches.reserve(changed.size());
    auto data_cur = clone_size;
    for (auto const& [index, data] : changed) {
        auto const checksum = data.checksum();
        auto loc = EntryLoc{};
        if (auto j = loc_by_checksum.find(checksum); j != loc_by_checksum.end()) {
            loc = j->second;
        } else {
            loc = {
                .type = data.type(),
                .subchunk_count = data.subchunk_count(),
                .subchunk_index = data.subchunk_index(),
                .offset = data_cur,
                .size = data.bytes_size(),
                .size_decompressed = data.size_decompressed(),
                .checksum = checksum,
            };
            if (loc.offset + loc.size >= 4 * io::GiB || loc.size_decompressed >= 4 * io::GiB) {
                return false;  // past what the u32 TOC offsets address: the full write packs tighter
            }
            loc_by_checksum.emplace_hint(j, checksum, loc);
            data_cur += loc.size;
        }
        patches.emplace_back(index,
                             EntryT{
                                 .name = toc.entries[index].name,
                                 .offset = (std::uint32_t)loc.offset,
                                 .size = (std::uint32_t)loc.size,
                                 .size_decompressed = (std::uint32_t)loc.size_decompressed,
                                 .type = loc.type,
                                 .subchunk_count = loc.subchunk_count,
                                 .subchunk_index = loc.subchunk_index,
                                 .checksum = loc.checksum,
                             });
    }

    // Data first, then the TOC slots pointing at it, then the header: in that order.
    {
        auto written = std::unordered_map<std::uint64_t, bool>{};
        for (auto const& [index, data] : changed) {
            auto const checksum = data.checksum();
            auto const& loc = loc_by_checksum.at(checksum);
            if (written[checksum]) continue;
            written[checksum] = true;
            pwrite_all(fd, data.bytes_data(), data.bytes_size(), loc.offset);
        }
    }
    for (auto const& [index, entry] : patches) {
        pwrite_all(fd, &entry, sizeof(EntryT), sizeof(HeaderT) + sizeof(EntryT) * index);
    }
    pwrite_all(fd, &header, sizeof(HeaderT), 0);

    lol_throw_if_msg(is_same_file(path, source_path), "Refusing to replace the game's WAD: {}", path);
    fs::rename(tmp, path);
    remove_tmp.armed = false;
    logi("Cloned wad: {} ({} changed entries, {} bytes added)", path, changed.size(), data_cur - clone_size);
    return true;
#endif
}

auto Archive::write_to_file(fs::path const& path) const -> void {
    lol_trace_func(lol_trace_var("{}", path));
    using HeaderT = TOC::latest_header_t;
    using EntryT = TOC::latest_entry_t;

    auto new_header = HeaderT{
        .version = TOC::Version::latest(),
        .signature = this->signature,
        .checksum = {},
        .desc_count = (std::uint32_t)entries.size(),
    };

    {
        auto version = TOC::Version::latest();
        XXH3_state_s hashstate = {};
        XXH3_64bits_reset(&hashstate);
        XXH3_64bits_update(&hashstate, &version, sizeof(version));
        for (auto const& [name, data] : entries) {
            auto const checksum = data.checksum();
            XXH3_64bits_update(&hashstate, &name, sizeof(name));
            XXH3_64bits_update(&hashstate, &checksum, sizeof(checksum));
        }
        auto const hashdigest = XXH3_64bits_digest(&hashstate);
        static_assert(sizeof(new_header.checksum) == sizeof(hashdigest));
        std::memcpy((char*)&new_header.checksum, (char const*)&hashdigest, sizeof(new_header.checksum));
    }

    {
        // A wad is only ever written as a plain file of its own: never through a symlink or into a
        // hardlinked file, either of which could be a game file (root ignores its permissions).
        struct ::stat st = {};
        if (::lstat(path.c_str(), &st) == 0) {
            lol_throw_if_msg(!S_ISREG(st.st_mode) || st.st_nlink > 1, "Refusing to write through a link: {}", path);
        }
    }
    if (!source_path.empty()) {
        // The overlay must never be (or link to) the game's own WAD: writing it would corrupt the game.
        // Directories first, so the check below resolves the very path that gets opened.
        fs::create_directories(path.parent_path());
        lol_throw_if_msg(is_same_file(path, source_path), "Refusing to write to the game's WAD: {}", path);
        if (write_cloned(path, new_header)) return;
    }

    auto file = io::File::create(path);

    if (auto old_header = HeaderT{}; file.readsome(0, &old_header, sizeof(HeaderT)) == sizeof(HeaderT)) {
        if (std::memcmp(&old_header, &new_header, sizeof(HeaderT)) == 0) {
            return;
        }
    }

    auto toc_entries = std::vector<EntryT>{};
    toc_entries.reserve(entries.size());

    std::size_t data_cur = sizeof(HeaderT) + sizeof(EntryT) * entries.size();
    {
        // Order any potential reads by address, this guarantees sequential reads on any memory mapped files.
        auto entries_data = std::vector<std::pair<hash::Xxh64, EntryData>>();
        entries_data.reserve(entries.size());
        entries_data.insert(entries_data.end(), entries.begin(), entries.end());
        std::sort(entries_data.begin(), entries_data.end(), [](auto const& l, auto const& r) -> bool {
            return (std::uintptr_t)l.second.bytes_data() < (std::uintptr_t)r.second.bytes_data();
        });

        // Deduplicate data locations by checksum
        auto loc_by_checksum = std::unordered_map<std::uint64_t, EntryLoc>();
        loc_by_checksum.reserve(entries.size() * 2);

        // Write all entries data and generate TOC
        file.reserve(0, estimate_size());
        for (auto const& entry : entries_data) {
            auto loc = EntryLoc{};
            auto data = entry.second.into_optimal();
            auto checksum = data.checksum();
            if (auto j = loc_by_checksum.find(checksum); j != loc_by_checksum.end()) {
                loc = j->second;
            } else {
                loc = {
                    .type = data.type(),
                    .subchunk_count = data.subchunk_count(),
                    .subchunk_index = data.subchunk_index(),
                    .offset = data_cur,
                    .size = data.bytes_size(),
                    .size_decompressed = data.size_decompressed(),
                    .checksum = checksum,
                };
                lol_throw_if(loc.size >= 4 * io::GiB);
                lol_throw_if(loc.size_decompressed >= 4 * io::GiB);
                lol_throw_if(loc.offset >= 4 * io::GiB);
                file.write(data_cur, data.bytes_data(), data.bytes_size());
                loc_by_checksum.emplace_hint(j, checksum, loc);
                data_cur += loc.size;
            }
            toc_entries.push_back(EntryT{
                .name = entry.first,
                .offset = (std::uint32_t)loc.offset,
                .size = (std::uint32_t)loc.size,
                .size_decompressed = (std::uint32_t)loc.size_decompressed,
                .type = loc.type,
                .subchunk_count = loc.subchunk_count,
                .subchunk_index = loc.subchunk_index,
                .checksum = loc.checksum,
            });
        };
    }

    {
        // TOC entries MUST be sorted by name
        std::sort(toc_entries.begin(), toc_entries.end(), [](auto const& l, auto const& r) -> bool {
            return l.name < r.name;
        });
    }

    // Write TOC after header
    file.write(sizeof(HeaderT), toc_entries.data(), toc_entries.size() * sizeof(EntryT));

    // Write header
    file.write(0, &new_header, sizeof(HeaderT));

    // Trunc data
    file.resize(data_cur);
}

auto Archive::touch() -> void {
    // Order any potential reads by address, this guarantees sequential reads on any memory mapped files.
    auto entries = std::vector<std::pair<hash::Xxh64, EntryData>>();
    entries.reserve(entries.size());
    entries.insert(entries.end(), entries.begin(), entries.end());
    std::sort(entries.begin(), entries.end(), [](auto const& l, auto const& r) -> bool {
        return (std::uintptr_t)l.second.bytes_data() < (std::uintptr_t)r.second.bytes_data();
    });

    for (auto& [name, data] : entries) {
        data.touch();
    }
}

auto Archive::mark_optimal() -> void {
    for (auto& [name, data] : entries) {
        data.mark_optimal(true);
    }
}
