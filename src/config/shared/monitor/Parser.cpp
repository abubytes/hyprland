#include "Parser.hpp"

#include "../../../debug/log/Logger.hpp"

#include <hyprutils/string/VarList2.hpp>
#include <hyprutils/string/Numeric.hpp>
#include <hyprutils/string/String.hpp>
#include <string>
#include <algorithm>
#include <cctype>
#include <format>

using namespace Config;
using namespace Hyprutils::String;

static bool parseModeLine(const std::string& modeline, drmModeModeInfo& mode) {
    auto args = CVarList2(std::string{modeline}, 0, 's');

    auto keyword = std::string{args[0]};
    std::ranges::transform(keyword, keyword.begin(), ::tolower);

    if (keyword != "modeline")
        return false;

    if (args.size() < 10) {
        Log::logger->log(Log::ERR, "modeline parse error: expected at least 9 arguments, got {}", args.size() - 1);
        return false;
    }

    int  argno = 1;

    auto huErrStr = [](Hyprutils::String::eNumericParseResult r) -> const char* {
        switch (r) {
            case Hyprutils::String::NUMERIC_PARSE_BAD: return "bad input";
            case Hyprutils::String::NUMERIC_PARSE_GARBAGE: return "garbage input";
            case Hyprutils::String::NUMERIC_PARSE_OUT_OF_RANGE: return "out of range";
            case Hyprutils::String::NUMERIC_PARSE_OK: return "ok";
            default: return "error";
        }
    };

#define ASSIGN_OR_FAIL(prop, type)                                                                                                                                                 \
    if (auto n = strToNumber<type>(args[argno++]); n)                                                                                                                              \
        prop = n.value();                                                                                                                                                          \
    else {                                                                                                                                                                         \
        Log::logger->log(Log::ERR, "modeline parse error: invalid input at \"{}\": {}", args[argno - 1], huErrStr(n.error()));                                                     \
        return false;                                                                                                                                                              \
    }

    mode.type = DRM_MODE_TYPE_USERDEF;

    ASSIGN_OR_FAIL(mode.clock, float);
    ASSIGN_OR_FAIL(mode.hdisplay, int);
    ASSIGN_OR_FAIL(mode.hsync_start, int);
    ASSIGN_OR_FAIL(mode.hsync_end, int);
    ASSIGN_OR_FAIL(mode.htotal, int);
    ASSIGN_OR_FAIL(mode.vdisplay, int);
    ASSIGN_OR_FAIL(mode.vsync_start, int);
    ASSIGN_OR_FAIL(mode.vsync_end, int);
    ASSIGN_OR_FAIL(mode.vtotal, int);

    mode.clock *= 1000;
    mode.vrefresh = mode.clock * 1000.0 * 1000.0 / mode.htotal / mode.vtotal;

#undef ASSIGN_OR_FAIL

    // clang-format off
    static std::unordered_map<std::string, uint32_t> flagsmap = {
        {"+hsync", DRM_MODE_FLAG_PHSYNC},
        {"-hsync", DRM_MODE_FLAG_NHSYNC},
        {"+vsync", DRM_MODE_FLAG_PVSYNC},
        {"-vsync", DRM_MODE_FLAG_NVSYNC},
        {"Interlace", DRM_MODE_FLAG_INTERLACE},
    };
    // clang-format on

    for (; argno < sc<int>(args.size()); argno++) {
        auto key = std::string{args[argno]};
        std::ranges::transform(key, key.begin(), ::tolower);

        auto it = flagsmap.find(key);

        if (it != flagsmap.end())
            mode.flags |= it->second;
        else
            Log::logger->log(Log::ERR, "Invalid flag {} in modeline", key);
    }

    const auto [nameEnd, size] = std::format_to_n(mode.name, sizeof(mode.name) - 1, "{}x{}@{}", mode.hdisplay, mode.vdisplay, mode.vrefresh / 1000);
    *nameEnd                   = '\0';

    return true;
}

CMonitorRuleParser::CMonitorRuleParser(const std::string& name) {
    m_rule.m_name = name;
}

const std::string& CMonitorRuleParser::name() {
    return m_rule.m_name;
}

Config::CMonitorRule& CMonitorRuleParser::rule() {
    return m_rule;
}

std::optional<std::string> CMonitorRuleParser::getError() {
    if (m_error.empty())
        return {};
    return m_error;
}

bool CMonitorRuleParser::parseMode(const std::string& value) {
    if (value.empty() || value.starts_with("pref"))
        m_rule.m_resolution = Vector2D();
    else if (value.starts_with("highrr"))
        m_rule.m_resolution = Vector2D(-1, -1);
    else if (value.starts_with("highres"))
        m_rule.m_resolution = Vector2D(-1, -2);
    else if (value.starts_with("maxwidth"))
        m_rule.m_resolution = Vector2D(-1, -3);
    else if (parseModeLine(value, m_rule.m_drmMode)) {
        m_rule.m_resolution  = Vector2D(m_rule.m_drmMode.hdisplay, m_rule.m_drmMode.vdisplay);
        m_rule.m_refreshRate = sc<float>(m_rule.m_drmMode.vrefresh) / 1000;
    } else {

        if (!value.contains("x")) {
            m_error += "invalid resolution ";
            m_rule.m_resolution = Vector2D();
            return false;
        } else {
            try {
                m_rule.m_resolution.x = stoi(value.substr(0, value.find_first_of('x')));
                m_rule.m_resolution.y = stoi(value.substr(value.find_first_of('x') + 1, value.find_first_of('@')));

                if (value.contains("@"))
                    m_rule.m_refreshRate = stof(value.substr(value.find_first_of('@') + 1));
            } catch (...) {
                m_error += "invalid resolution ";
                m_rule.m_resolution = Vector2D();
                return false;
            }
        }
    }
    return true;
}

bool CMonitorRuleParser::parsePosition(const std::string& value, bool isFirst) {
    if (value.empty() || value.starts_with("auto")) {
        m_rule.m_offset = Vector2D(-INT32_MAX, -INT32_MAX);
        // If this is the first monitor rule needs to be on the right.
        if (value.empty() || value == "auto-right" || value == "auto" || isFirst)
            m_rule.m_autoDir = eAutoDirs::DIR_AUTO_RIGHT;
        else if (value == "auto-left")
            m_rule.m_autoDir = eAutoDirs::DIR_AUTO_LEFT;
        else if (value == "auto-up")
            m_rule.m_autoDir = eAutoDirs::DIR_AUTO_UP;
        else if (value == "auto-down")
            m_rule.m_autoDir = eAutoDirs::DIR_AUTO_DOWN;
        else if (value == "auto-center-right")
            m_rule.m_autoDir = eAutoDirs::DIR_AUTO_CENTER_RIGHT;
        else if (value == "auto-center-left")
            m_rule.m_autoDir = eAutoDirs::DIR_AUTO_CENTER_LEFT;
        else if (value == "auto-center-up")
            m_rule.m_autoDir = eAutoDirs::DIR_AUTO_CENTER_UP;
        else if (value == "auto-center-down")
            m_rule.m_autoDir = eAutoDirs::DIR_AUTO_CENTER_DOWN;
        else {
            Log::logger->log(Log::WARN,
                             "Invalid auto direction. Valid options are 'auto',"
                             "'auto-up', 'auto-down', 'auto-left', 'auto-right',"
                             "'auto-center-up', 'auto-center-down',"
                             "'auto-center-left', and 'auto-center-right'.");
            m_error += "invalid auto direction ";
            return false;
        }
    } else {
        if (!value.contains("x")) {
            m_error += "invalid offset ";
            m_rule.m_offset = Vector2D(-INT32_MAX, -INT32_MAX);
            return false;
        } else {
            try {
                m_rule.m_offset.x = stoi(value.substr(0, value.find_first_of('x')));
                m_rule.m_offset.y = stoi(value.substr(value.find_first_of('x') + 1));
            } catch (...) {
                m_error += "invalid offset ";
                m_rule.m_offset = Vector2D(-INT32_MAX, -INT32_MAX);
                return false;
            }
        }
    }
    return true;
}

bool CMonitorRuleParser::parseScale(const std::string& value) {
    if (value.empty() || value.starts_with("auto"))
        m_rule.m_scale = -1;
    else {
        if (!isNumber(value, true)) {
            m_error += "invalid scale ";
            return false;
        } else {
            m_rule.m_scale = stof(value);

            if (m_rule.m_scale < 0.25F) {
                m_error += "invalid scale ";
                m_rule.m_scale = 1;
                return false;
            }
        }
    }
    return true;
}

bool CMonitorRuleParser::parseTransform(const std::string& value) {
    if (!isNumber(value)) {
        m_error += "invalid transform ";
        return false;
    }

    const auto TSF = std::stoi(value);
    if (std::clamp(TSF, 0, 7) != TSF) {
        Log::logger->log(Log::ERR, "Invalid transform {} in monitor", TSF);
        m_error += "invalid transform ";
        return false;
    }
    m_rule.m_transform = sc<wl_output_transform>(TSF);
    return true;
}

bool CMonitorRuleParser::parseBitdepth(const std::string& value) {
    m_rule.m_enable10bit = value == "10";
    return true;
}

bool CMonitorRuleParser::parseCM(const std::string& value) {
    auto parsedCM = NCMType::fromString(value);
    if (!parsedCM.has_value()) {
        m_error += "invalid cm ";
        return false;
    }
    m_rule.m_cmType = parsedCM.value();
    return true;
}

bool CMonitorRuleParser::parseSDRBrightness(const std::string& value) {
    try {
        m_rule.m_sdrBrightness = stof(value);
    } catch (...) {
        m_error += "invalid sdrbrightness ";
        return false;
    }
    return true;
}

bool CMonitorRuleParser::parseSDRSaturation(const std::string& value) {
    try {
        m_rule.m_sdrSaturation = stof(value);
    } catch (...) {
        m_error += "invalid sdrsaturation ";
        return false;
    }
    return true;
}

bool CMonitorRuleParser::parseVRR(const std::string& value) {
    if (!isNumber(value)) {
        m_error += "invalid vrr ";
        return false;
    }

    const auto VRR = std::stoi(value);
    m_rule.m_vrr   = VRR < 0 ? std::nullopt : std::optional(VRR);
    return true;
}

bool CMonitorRuleParser::parseICC(const std::string& val) {
    if (val.empty()) {
        m_error += "invalid icc ";
        return false;
    }
    m_rule.m_iccFile = val;
    return true;
}

static std::vector<std::string> splitBy(const std::string& value, char delimiter) {
    std::vector<std::string> result;
    size_t                   start = 0;

    while (start <= value.size()) {
        const auto END = value.find(delimiter, start);
        result.emplace_back(trim(value.substr(start, END == std::string::npos ? std::string::npos : END - start)));

        if (END == std::string::npos)
            break;

        start = END + 1;
    }

    return result;
}

static bool parseFloatStrict(const std::string& value, float& out) {
    try {
        size_t pos = 0;
        out        = std::stof(value, &pos);
        return pos == value.size();
    } catch (...) { return false; }
}

static bool parseSplitTrack(const std::string& raw, CMonitorRule::SSplitTrack& out) {
    auto token = trim(raw);
    std::ranges::transform(token, token.begin(), ::tolower);

    if (token.empty())
        return false;

    if (token == "*") {
        out = {.type = CMonitorRule::SSplitTrack::TRACK_FRACTION, .value = 1.F};
        return true;
    }

    auto parseWithSuffix = [&](std::string suffix, CMonitorRule::SSplitTrack::eType type, float multiplier = 1.F) -> bool {
        if (!token.ends_with(suffix))
            return false;

        auto number = trim(token.substr(0, token.size() - suffix.size()));
        if (number.empty() && type == CMonitorRule::SSplitTrack::TRACK_FRACTION)
            number = "1";

        float value = 0.F;
        if (!parseFloatStrict(number, value) || value <= 0.F)
            return false;

        out = {.type = type, .value = value * multiplier};
        return true;
    };

    if (parseWithSuffix("px", CMonitorRule::SSplitTrack::TRACK_PIXELS))
        return true;
    if (parseWithSuffix("%", CMonitorRule::SSplitTrack::TRACK_PERCENT, 0.01F))
        return true;
    if (parseWithSuffix("fr", CMonitorRule::SSplitTrack::TRACK_FRACTION))
        return true;
    if (parseWithSuffix("*", CMonitorRule::SSplitTrack::TRACK_FRACTION))
        return true;

    float pixels = 0.F;
    if (!parseFloatStrict(token, pixels) || pixels <= 0.F)
        return false;

    out = {.type = CMonitorRule::SSplitTrack::TRACK_PIXELS, .value = pixels};
    return true;
}

static bool parseSplitTracks(const std::string& raw, std::vector<CMonitorRule::SSplitTrack>& out) {
    out.clear();

    for (const auto& token : splitBy(raw, '|')) {
        CMonitorRule::SSplitTrack track;
        if (!parseSplitTrack(token, track))
            return false;
        out.emplace_back(track);
    }

    return !out.empty() && out.size() <= 64;
}

static bool parseSplitVector(const std::string& raw, Vector2D& out) {
    auto value = trim(raw);
    std::ranges::transform(value, value.begin(), ::tolower);

    const auto X = value.find('x');
    if (X == std::string::npos)
        return false;

    float x = 0.F, y = 0.F;
    if (!parseFloatStrict(trim(value.substr(0, X)), x) || !parseFloatStrict(trim(value.substr(X + 1)), y))
        return false;

    out = Vector2D{x, y};
    return true;
}

static bool validSplitAreaName(const std::string& name) {
    return std::ranges::all_of(name, [](unsigned char c) { return std::isalnum(c) || c == '_' || c == '-'; });
}

static bool parseSplitAreas(const std::string& raw, std::vector<CMonitorRule::SSplitArea>& out) {
    out.clear();

    for (const auto& item : splitBy(raw, ';')) {
        if (item.empty())
            return false;

        std::string name;
        std::string rect = item;

        const auto EQUALS = item.find('=');
        const auto AT     = item.find('@');
        if (EQUALS != std::string::npos && (AT == std::string::npos || EQUALS < AT)) {
            name = trim(item.substr(0, EQUALS));
            rect = trim(item.substr(EQUALS + 1));

            if (name.empty() || !validSplitAreaName(name))
                return false;
        }

        const auto RECT_AT = rect.find('@');
        if (RECT_AT == std::string::npos)
            return false;

        Vector2D offset, size;
        if (!parseSplitVector(rect.substr(0, RECT_AT), offset) || !parseSplitVector(rect.substr(RECT_AT + 1), size))
            return false;

        if (offset.x < 0 || offset.y < 0 || size.x <= 0 || size.y <= 0)
            return false;

        out.emplace_back(CMonitorRule::SSplitArea{.name = name, .offset = offset, .size = size});
    }

    return !out.empty() && out.size() <= 64;
}

bool CMonitorRuleParser::parseSplit(const std::string& value) {
    auto split = trim(value);
    auto lower = split;
    std::ranges::transform(lower, lower.begin(), ::tolower);

    m_rule.m_splitColumns.clear();
    m_rule.m_splitRows.clear();
    m_rule.m_splitAreas.clear();

    if (lower.empty() || lower == "none" || lower == "off") {
        m_rule.m_split = Vector2D(1, 1);
        return true;
    }

    auto parseTracksPayload = [&](const std::string& payload) -> bool {
        std::vector<CMonitorRule::SSplitTrack> columns;
        std::vector<CMonitorRule::SSplitTrack> rows;

        auto groups = splitBy(payload, ';');

        if (groups.size() == 1) {
            if (!parseSplitTracks(groups[0], columns))
                return false;
            rows = {CMonitorRule::SSplitTrack{}};
        } else if (groups.size() == 2 && !groups[0].contains('=') && !groups[1].contains('=')) {
            if (!parseSplitTracks(groups[0], columns) || !parseSplitTracks(groups[1], rows))
                return false;
        } else {
            for (const auto& group : groups) {
                auto entry = trim(group);
                auto key   = entry.substr(0, entry.find('='));
                std::ranges::transform(key, key.begin(), ::tolower);

                if (entry.find('=') == std::string::npos)
                    return false;

                const auto tracks = entry.substr(entry.find('=') + 1);
                if (key == "cols" || key == "columns") {
                    if (!parseSplitTracks(tracks, columns))
                        return false;
                } else if (key == "rows") {
                    if (!parseSplitTracks(tracks, rows))
                        return false;
                } else
                    return false;
            }

            if (columns.empty())
                columns = {CMonitorRule::SSplitTrack{}};
            if (rows.empty())
                rows = {CMonitorRule::SSplitTrack{}};
        }

        if (columns.size() * rows.size() > 64)
            return false;

        m_rule.m_splitColumns = std::move(columns);
        m_rule.m_splitRows    = std::move(rows);
        m_rule.m_split        = Vector2D(sc<int>(m_rule.m_splitColumns.size()), sc<int>(m_rule.m_splitRows.size()));
        return true;
    };

    if (lower.starts_with("cols:") || lower.starts_with("columns:")) {
        const auto POS = split.find(':');
        if (!parseTracksPayload(split.substr(POS + 1))) {
            m_error += "invalid split ";
            return false;
        }
        return true;
    }

    if (lower.starts_with("rows:")) {
        std::vector<CMonitorRule::SSplitTrack> rows;
        if (!parseSplitTracks(split.substr(split.find(':') + 1), rows)) {
            m_error += "invalid split ";
            return false;
        }
        m_rule.m_splitColumns = {CMonitorRule::SSplitTrack{}};
        m_rule.m_splitRows    = std::move(rows);
        m_rule.m_split        = Vector2D(1, sc<int>(m_rule.m_splitRows.size()));
        return true;
    }

    if (lower.starts_with("grid:") || lower.starts_with("tracks:")) {
        if (!parseTracksPayload(split.substr(split.find(':') + 1))) {
            m_error += "invalid split ";
            return false;
        }
        return true;
    }

    if (lower.starts_with("areas:") || lower.starts_with("rects:")) {
        if (!parseSplitAreas(split.substr(split.find(':') + 1), m_rule.m_splitAreas)) {
            m_error += "invalid split ";
            return false;
        }
        m_rule.m_split = Vector2D(sc<int>(m_rule.m_splitAreas.size()), 1);
        return true;
    }

    int columns = 1;
    int rows    = 1;

    try {
        if (lower == "horizontal") {
            columns = 2;
        } else if (lower == "vertical") {
            rows = 2;
        } else if (lower.starts_with("horizontal:")) {
            columns = std::stoi(lower.substr(lower.find(':') + 1));
        } else if (lower.starts_with("vertical:")) {
            rows = std::stoi(lower.substr(lower.find(':') + 1));
        } else if (lower.contains('x')) {
            columns = std::stoi(lower.substr(0, lower.find('x')));
            rows    = std::stoi(lower.substr(lower.find('x') + 1));
        } else {
            m_error += "invalid split ";
            return false;
        }
    } catch (...) {
        m_error += "invalid split ";
        return false;
    }

    if (columns < 1 || rows < 1 || columns > 16 || rows > 16 || columns * rows > 64) {
        m_error += "invalid split ";
        return false;
    }

    m_rule.m_split = Vector2D(columns, rows);
    return true;
}

void CMonitorRuleParser::setDisabled() {
    m_rule.m_disabled = true;
}

void CMonitorRuleParser::setMirror(const std::string& value) {
    m_rule.m_mirrorOf = value;
}

bool CMonitorRuleParser::setReserved(const Desktop::CReservedArea& value) {
    m_rule.m_reservedArea = value;
    return true;
}
