const std = @import("std");

pub const SupportedFormat = enum {
    hwpx,
    hwp,
};

pub const FormatInfo = struct {
    name: []const u8,
    editable: bool,
    format: SupportedFormat,
};

pub fn detectFromPath(path: []const u8) !FormatInfo {
    const ext = std.fs.path.extension(path);
    if (std.ascii.eqlIgnoreCase(ext, ".hwpx")) {
        return .{
            .name = "HWPX (ZIP/XML)",
            .editable = true,
            .format = .hwpx,
        };
    }
    if (std.ascii.eqlIgnoreCase(ext, ".hwp")) {
        return .{
            .name = "HWP (OLE binary)",
            .editable = false,
            .format = .hwp,
        };
    }
    return error.UnsupportedFormat;
}
