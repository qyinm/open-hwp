const std = @import("std");

const XmlToolError = error{
    InvalidXml,
    TextNodeCountMismatch,
};

const TagKind = enum {
    start,
    end,
    self_closing,
    special,
};

const TagToken = struct {
    kind: TagKind,
    name: []const u8,
};

const ScanState = struct {
    run_depth: usize = 0,
    text_depth: usize = 0,
};

const RunTextSpan = struct {
    start: usize,
    end: usize,
};

pub const RunTextValue = struct {
    text: []const u8,
};

fn isSpace(ch: u8) bool {
    return ch == ' ' or ch == '\t' or ch == '\r' or ch == '\n';
}

fn trimAsciiRight(input: []const u8) []const u8 {
    var end = input.len;
    while (end > 0 and isSpace(input[end - 1])) : (end -= 1) {}
    return input[0..end];
}

fn localName(name: []const u8) []const u8 {
    if (std.mem.lastIndexOfScalar(u8, name, ':')) |idx| {
        return name[idx + 1 ..];
    }
    return name;
}

fn parseTagToken(raw_tag: []const u8) TagToken {
    var view = std.mem.trim(u8, raw_tag, " \t\r\n");
    if (view.len == 0) {
        return .{ .kind = .special, .name = "" };
    }
    if (view[0] == '!' or view[0] == '?') {
        return .{ .kind = .special, .name = "" };
    }

    var kind: TagKind = .start;
    if (view[0] == '/') {
        kind = .end;
        view = std.mem.trimLeft(u8, view[1..], " \t\r\n");
    } else {
        const right_trimmed = trimAsciiRight(view);
        if (right_trimmed.len > 0 and right_trimmed[right_trimmed.len - 1] == '/') {
            kind = .self_closing;
            view = trimAsciiRight(right_trimmed[0 .. right_trimmed.len - 1]);
        }
    }

    var end: usize = 0;
    while (end < view.len and !isSpace(view[end])) : (end += 1) {}
    const name = if (end == 0) "" else view[0..end];
    return .{ .kind = kind, .name = name };
}

fn findTagClose(xml_data: []const u8, lt_index: usize) ?usize {
    var i = lt_index + 1;
    var quote: u8 = 0;
    while (i < xml_data.len) : (i += 1) {
        const ch = xml_data[i];
        if (quote != 0) {
            if (ch == quote) quote = 0;
            continue;
        }
        if (ch == '"' or ch == '\'') {
            quote = ch;
            continue;
        }
        if (ch == '>') return i;
    }
    return null;
}

fn updateScanState(scan: *ScanState, tag: TagToken) void {
    const lname = localName(tag.name);

    switch (tag.kind) {
        .start => {
            if (std.mem.eql(u8, lname, "run")) {
                scan.run_depth += 1;
            } else if (std.mem.eql(u8, lname, "t") and scan.run_depth > 0) {
                scan.text_depth += 1;
            }
        },
        .end => {
            if (std.mem.eql(u8, lname, "t")) {
                if (scan.text_depth > 0) scan.text_depth -= 1;
            } else if (std.mem.eql(u8, lname, "run")) {
                if (scan.run_depth > 0) scan.run_depth -= 1;
            }
        },
        .self_closing => {},
        .special => {},
    }
}

fn appendDecodedXmlText(out: *std.ArrayList(u8), allocator: std.mem.Allocator, text: []const u8) !void {
    var i: usize = 0;
    while (i < text.len) {
        if (text[i] != '&') {
            try out.append(allocator, text[i]);
            i += 1;
            continue;
        }

        if (std.mem.startsWith(u8, text[i..], "&amp;")) {
            try out.append(allocator, '&');
            i += 5;
            continue;
        }
        if (std.mem.startsWith(u8, text[i..], "&lt;")) {
            try out.append(allocator, '<');
            i += 4;
            continue;
        }
        if (std.mem.startsWith(u8, text[i..], "&gt;")) {
            try out.append(allocator, '>');
            i += 4;
            continue;
        }
        if (std.mem.startsWith(u8, text[i..], "&quot;")) {
            try out.append(allocator, '"');
            i += 6;
            continue;
        }
        if (std.mem.startsWith(u8, text[i..], "&apos;")) {
            try out.append(allocator, '\'');
            i += 6;
            continue;
        }

        // Keep unknown entities as-is.
        try out.append(allocator, '&');
        i += 1;
    }
}

fn appendEscapedXmlText(out: *std.ArrayList(u8), allocator: std.mem.Allocator, text: []const u8) !void {
    for (text) |ch| {
        switch (ch) {
            '&' => try out.appendSlice(allocator, "&amp;"),
            '<' => try out.appendSlice(allocator, "&lt;"),
            '>' => try out.appendSlice(allocator, "&gt;"),
            '"' => try out.appendSlice(allocator, "&quot;"),
            '\'' => try out.appendSlice(allocator, "&apos;"),
            else => try out.append(allocator, ch),
        }
    }
}

fn collectRunTextSpans(allocator: std.mem.Allocator, xml_data: []const u8) ![]RunTextSpan {
    var spans = std.ArrayList(RunTextSpan).empty;
    errdefer spans.deinit(allocator);

    var scan = ScanState{};
    var i: usize = 0;
    while (i < xml_data.len) {
        if (xml_data[i] == '<') {
            const close = findTagClose(xml_data, i) orelse return XmlToolError.InvalidXml;
            const raw = xml_data[i + 1 .. close];
            const tag = parseTagToken(raw);
            updateScanState(&scan, tag);
            i = close + 1;
            continue;
        }

        var next = i;
        while (next < xml_data.len and xml_data[next] != '<') : (next += 1) {}
        if (scan.text_depth > 0 and next > i) {
            try spans.append(allocator, .{ .start = i, .end = next });
        }
        i = next;
    }

    return spans.toOwnedSlice(allocator);
}

pub fn collectRunTextValues(allocator: std.mem.Allocator, xml_data: []const u8) ![]RunTextValue {
    const spans = try collectRunTextSpans(allocator, xml_data);
    defer allocator.free(spans);

    var values = std.ArrayList(RunTextValue).empty;
    errdefer {
        for (values.items) |value| allocator.free(value.text);
        values.deinit(allocator);
    }

    for (spans) |span| {
        var decoded = std.ArrayList(u8).empty;
        defer decoded.deinit(allocator);
        try appendDecodedXmlText(&decoded, allocator, xml_data[span.start..span.end]);
        try values.append(allocator, .{ .text = try decoded.toOwnedSlice(allocator) });
    }

    return values.toOwnedSlice(allocator);
}

pub fn freeRunTextValues(allocator: std.mem.Allocator, values: []RunTextValue) void {
    for (values) |value| allocator.free(value.text);
    allocator.free(values);
}

pub fn applyRunTextValues(
    allocator: std.mem.Allocator,
    xml_data: []const u8,
    values: []const RunTextValue,
) ![]u8 {
    const spans = try collectRunTextSpans(allocator, xml_data);
    defer allocator.free(spans);

    if (spans.len != values.len) return XmlToolError.TextNodeCountMismatch;

    var output = std.ArrayList(u8).empty;
    errdefer output.deinit(allocator);

    var cursor: usize = 0;
    for (spans, values) |span, value| {
        try output.appendSlice(allocator, xml_data[cursor..span.start]);
        try appendEscapedXmlText(&output, allocator, value.text);
        cursor = span.end;
    }
    try output.appendSlice(allocator, xml_data[cursor..]);
    return output.toOwnedSlice(allocator);
}

pub fn extractText(allocator: std.mem.Allocator, xml_data: []const u8) ![]u8 {
    var output = std.ArrayList(u8).empty;
    errdefer output.deinit(allocator);

    var scan = ScanState{};
    var i: usize = 0;
    while (i < xml_data.len) {
        if (xml_data[i] == '<') {
            const close = findTagClose(xml_data, i) orelse return XmlToolError.InvalidXml;
            const raw = xml_data[i + 1 .. close];
            const tag = parseTagToken(raw);

            if ((tag.kind == .start or tag.kind == .self_closing) and std.mem.eql(u8, localName(tag.name), "lineBreak") and scan.run_depth > 0) {
                try output.append(allocator, '\n');
            } else if (tag.kind == .end and std.mem.eql(u8, localName(tag.name), "p")) {
                // Keep paragraph-level readability in extracted plain text.
                if (output.items.len > 0 and output.items[output.items.len - 1] != '\n') {
                    try output.append(allocator, '\n');
                }
            }

            updateScanState(&scan, tag);
            i = close + 1;
            continue;
        }

        var next = i;
        while (next < xml_data.len and xml_data[next] != '<') : (next += 1) {}
        if (scan.text_depth > 0) {
            try appendDecodedXmlText(&output, allocator, xml_data[i..next]);
        }
        i = next;
    }

    const trimmed = std.mem.trimRight(u8, output.items, "\n");
    if (trimmed.len == output.items.len) {
        return output.toOwnedSlice(allocator);
    }

    const duped = try allocator.dupe(u8, trimmed);
    output.deinit(allocator);
    return duped;
}

pub fn replaceText(
    allocator: std.mem.Allocator,
    xml_data: []const u8,
    find: []const u8,
    replace: []const u8,
) ![]u8 {
    const collected = try collectRunTextValues(allocator, xml_data);
    defer freeRunTextValues(allocator, collected);

    var replaced_values = std.ArrayList(RunTextValue).empty;
    errdefer {
        for (replaced_values.items) |value| allocator.free(value.text);
        replaced_values.deinit(allocator);
    }

    for (collected) |value| {
        if (find.len == 0) {
            try replaced_values.append(allocator, .{ .text = try allocator.dupe(u8, value.text) });
        } else {
            const replaced = try std.mem.replaceOwned(u8, allocator, value.text, find, replace);
            try replaced_values.append(allocator, .{ .text = replaced });
        }
    }
    const replaced_slice = try replaced_values.toOwnedSlice(allocator);
    defer freeRunTextValues(allocator, replaced_slice);
    return applyRunTextValues(allocator, xml_data, replaced_slice);
}

test "replaceText only changes hp:t text inside hp:run" {
    const allocator = std.testing.allocator;

    const xml =
        \\<root>
        \\  <hp:run><hp:t>Hello OpenHWP</hp:t></hp:run>
        \\  <meta>OpenHWP</meta>
        \\  <hp:run><hp:t>Open</hp:t><hp:t>HWP</hp:t></hp:run>
        \\</root>
    ;

    const out = try replaceText(allocator, xml, "OpenHWP", "HWPX");
    defer allocator.free(out);

    try std.testing.expect(std.mem.indexOf(u8, out, "<hp:t>Hello HWPX</hp:t>") != null);
    try std.testing.expect(std.mem.indexOf(u8, out, "<meta>OpenHWP</meta>") != null);
    try std.testing.expect(std.mem.indexOf(u8, out, "<hp:t>Open</hp:t><hp:t>HWP</hp:t>") != null);
}

test "extractText reads run text and decodes basic entities" {
    const allocator = std.testing.allocator;

    const xml =
        \\<hp:section xmlns:hp="urn:test">
        \\  <hp:p><hp:run><hp:t>A&amp;B</hp:t></hp:run></hp:p>
        \\  <hp:p><hp:run><hp:t>Line1</hp:t><hp:lineBreak/></hp:run><hp:run><hp:t>Line2</hp:t></hp:run></hp:p>
        \\</hp:section>
    ;

    const out = try extractText(allocator, xml);
    defer allocator.free(out);

    try std.testing.expectEqualStrings("A&B\nLine1\nLine2", out);
}

test "applyRunTextValues rewrites nodes with XML escaping" {
    const allocator = std.testing.allocator;

    const xml =
        \\<root>
        \\  <hp:run><hp:t>A&amp;B</hp:t></hp:run>
        \\  <hp:run><hp:t>Second</hp:t></hp:run>
        \\</root>
    ;

    const values = [_]RunTextValue{
        .{ .text = "A < B & C" },
        .{ .text = "Q\"Z" },
    };

    const out = try applyRunTextValues(allocator, xml, values[0..]);
    defer allocator.free(out);

    try std.testing.expect(std.mem.indexOf(u8, out, "<hp:t>A &lt; B &amp; C</hp:t>") != null);
    try std.testing.expect(std.mem.indexOf(u8, out, "<hp:t>Q&quot;Z</hp:t>") != null);
}
