-- Adjacent Lualand Next Lua entrypoint.
-- This file intentionally does not source the old keybind files that still
-- call qs -c ii. It is a small runnable bridge for the corrected target.

local repo = "/home/marv/code/new-hyprland"
local next_root = repo .. "/lualand-next"
local old = "/home/marv/.config/hypr-lua"

local function source(path)
    dofile(path)
end

source(old .. "/hyprland/env.lua")
source(old .. "/hyprland/general.lua")
source(old .. "/hyprland/rules.lua")
source(old .. "/hyprland/colors.lua")
source(old .. "/custom/env.lua")
source(old .. "/custom/general.lua")
source(old .. "/custom/rules.lua")
source(old .. "/custom/stupid.lua")
source(old .. "/generated/agent-workspaces.lua")

hl.monitor({ output = "eDP-1", mode = "preferred", position = "0x100", scale = "1.0", split = "off" })
hl.monitor({ output = "HDMI-A-1", mode = "preferred", position = "1920x0", scale = "1.0", split = "cols:3fr|1fr" })
hl.monitor({ output = "desc:Lenovo Group Limited 0x9059", mode = "1920x1080@120.21", position = "0x100", scale = "1.0", split = "off" })
hl.monitor({ output = "desc:Xiaomi Corporation Mi Monitor 6305910042837", mode = "2560x1440@75.03", position = "1920x100", scale = "1.0", split = "cols:3fr|1fr" })

local node = "node " .. next_root
local workstation = node .. "/bin/workstation.js"

hl.on("hyprland.start", function()
    hl.dispatch(hl.dsp.submap("global"))
    hl.exec_cmd(next_root .. "/scripts/autostart.sh")
    hl.exec_cmd("gnome-keyring-daemon --start --components=secrets")
    hl.exec_cmd("/usr/lib/polkit-kde-authentication-agent-1 || /usr/libexec/polkit-kde-authentication-agent-1 || /usr/lib/polkit-gnome/polkit-gnome-authentication-agent-1 || /usr/libexec/polkit-gnome-authentication-agent-1")
    hl.exec_cmd("dbus-update-activation-environment --all")
    hl.exec_cmd("sleep 1 && dbus-update-activation-environment --systemd WAYLAND_DISPLAY XDG_CURRENT_DESKTOP")
    hl.exec_cmd("wl-paste --type text --watch cliphist store")
    hl.exec_cmd("wl-paste --type image --watch cliphist store")
    hl.exec_cmd("hyprctl setcursor Bibata-Modern-Classic 24")
end)

hl.define_submap("global", function()
    hl.bind("SUPER + Return", hl.dsp.exec_cmd("foot"), { description = "Terminal" })
    hl.bind("SUPER + Q", hl.dsp.window.close(), { description = "Close focused window" })
    hl.bind("SUPER + SHIFT + C", hl.dsp.window.close(), { description = "Close focused window" })
    hl.bind("ALT + F4", hl.dsp.window.close(), { description = "Close focused window" })

    hl.bind("SUPER + S", hl.dsp.workspace.toggle_special("special"))
    hl.bind("SUPER + D", hl.dsp.workspace.toggle_special("studying"))
    hl.bind("SUPER + C", hl.dsp.workspace.toggle_special("llm"))
    hl.bind("SUPER + Z", hl.dsp.workspace.toggle_special("typing"))

    hl.bind("SUPER + Comma", hl.dsp.focus({ monitor = "eDP-1" }))
    hl.bind("SUPER + ALT + 1", hl.dsp.focus({ monitor = "eDP-1" }))
    hl.bind("SUPER + Period", hl.dsp.focus({ monitor = "HDMI-A-1~1" }))
    hl.bind("SUPER + SHIFT + Period", hl.dsp.focus({ monitor = "HDMI-A-1~1" }))
    hl.bind("SUPER + ALT + 2", hl.dsp.focus({ monitor = "HDMI-A-1~1" }))

    hl.bind("SUPER + j", hl.dsp.layout("cyclenext"), { repeating = true })
    hl.bind("SUPER + k", hl.dsp.layout("cycleprev"), { repeating = true })
    hl.bind("SUPER + SHIFT + j", hl.dsp.layout("swapnext"), { repeating = true })
    hl.bind("SUPER + SHIFT + k", hl.dsp.layout("swapprev"), { repeating = true })
    hl.bind("SUPER + SHIFT + l", hl.dsp.layout("mfact +0.02"), { repeating = true })
    hl.bind("SUPER + SHIFT + h", hl.dsp.layout("mfact -0.02"), { repeating = true })

    hl.bind("KP_End", hl.dsp.exec_cmd(workstation .. " switch-numpad 1"))
    hl.bind("KP_Down", hl.dsp.exec_cmd(workstation .. " switch-numpad 2"))
    hl.bind("KP_Next", hl.dsp.exec_cmd(workstation .. " switch-numpad 3"))
    hl.bind("KP_Left", hl.dsp.exec_cmd(workstation .. " switch-numpad 4"))
    hl.bind("KP_Begin", hl.dsp.exec_cmd(workstation .. " switch-numpad 5"))
    hl.bind("KP_Right", hl.dsp.exec_cmd(workstation .. " switch-numpad 6"))
    hl.bind("KP_Home", hl.dsp.exec_cmd(workstation .. " switch-numpad 7"))
    hl.bind("KP_Up", hl.dsp.exec_cmd(workstation .. " switch-numpad 8"))
    hl.bind("KP_Prior", hl.dsp.exec_cmd(workstation .. " switch-numpad 9"))

    hl.bind("SUPER + code:10", hl.dsp.exec_cmd(workstation .. " workspace 1"))
    hl.bind("SUPER + code:11", hl.dsp.exec_cmd(workstation .. " workspace 2"))
    hl.bind("SUPER + code:12", hl.dsp.exec_cmd(workstation .. " workspace 3"))
    hl.bind("SUPER + code:13", hl.dsp.exec_cmd(workstation .. " workspace 4"))
    hl.bind("SUPER + code:14", hl.dsp.exec_cmd(workstation .. " workspace 5"))
    hl.bind("SUPER + code:15", hl.dsp.exec_cmd(workstation .. " workspace 6"))
    hl.bind("SUPER + code:16", hl.dsp.exec_cmd(workstation .. " workspace 7"))
    hl.bind("SUPER + code:17", hl.dsp.exec_cmd(workstation .. " workspace 8"))
    hl.bind("SUPER + code:18", hl.dsp.exec_cmd(workstation .. " workspace 9"))
    hl.bind("SUPER + code:19", hl.dsp.exec_cmd(workstation .. " workspace 10"))

    hl.bind("SUPER + SHIFT + code:10", hl.dsp.exec_cmd(workstation .. " move 1"))
    hl.bind("SUPER + SHIFT + code:11", hl.dsp.exec_cmd(workstation .. " move 2"))
    hl.bind("SUPER + SHIFT + code:12", hl.dsp.exec_cmd(workstation .. " move 3"))
    hl.bind("SUPER + SHIFT + code:13", hl.dsp.exec_cmd(workstation .. " move 4"))
    hl.bind("SUPER + SHIFT + code:14", hl.dsp.exec_cmd(workstation .. " move 5"))
    hl.bind("SUPER + SHIFT + code:15", hl.dsp.exec_cmd(workstation .. " move 6"))
    hl.bind("SUPER + SHIFT + code:16", hl.dsp.exec_cmd(workstation .. " move 7"))
    hl.bind("SUPER + SHIFT + code:17", hl.dsp.exec_cmd(workstation .. " move 8"))
    hl.bind("SUPER + SHIFT + code:18", hl.dsp.exec_cmd(workstation .. " move 9"))
    hl.bind("SUPER + SHIFT + code:19", hl.dsp.exec_cmd(workstation .. " move 10"))
end)
