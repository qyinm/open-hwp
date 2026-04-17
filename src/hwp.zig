const std = @import("std");

pub fn extractText(_: std.mem.Allocator, _: []const u8) ![]u8 {
    return error.UnsupportedLegacyFormat;
}
