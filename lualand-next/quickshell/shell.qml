//@ pragma ShellId lualand-next
//@ pragma AppId land.lualand.next.shell
//@ pragma Env QS_NO_RELOAD_POPUP=1
//@ pragma Env QT_QUICK_CONTROLS_STYLE=Basic
//@ pragma Env QT_QUICK_FLICKABLE_WHEEL_DECELERATION=10000

import "./components" as LualandNext
import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Wayland

ShellRoot {
    id: root

    readonly property int barHeight: 30
    readonly property int panelWidth: 398
    readonly property int panelHeight: 760
    readonly property int gmHeight: 170
    readonly property string actionScript: "/home/marv/code/new-hyprland/lualand-next/scripts/timeblock-action.sh"
    readonly property var colors: ({
        "paper": "#07090c",
        "surface": "#11161c",
        "surface2": "#171f26",
        "ink": "#edf2f7",
        "muted": "#8a96a3",
        "line": "#303946",
        "accent": "#64d2ff",
        "good": "#8bd17c",
        "bad": "#ff6b7a"
    })
    readonly property string statePath: {
        const envPath = Quickshell.env("LUALAND_NEXT_QS_STATE");
        return envPath && envPath !== "" ? envPath : "/tmp/lualand-next/view-state.json";
    }
    readonly property string sideTargetScreen: {
        const envScreen = Quickshell.env("LUALAND_NEXT_SIDE_SCREEN") || Quickshell.env("LUALAND_NEXT_QS_SCREEN");
        return envScreen && envScreen !== "" ? envScreen : "side";
    }
    readonly property string gmTargetScreen: {
        const envScreen = Quickshell.env("LUALAND_NEXT_GM_SCREEN");
        return envScreen && envScreen !== "" ? envScreen : "laptop";
    }
    property var shellState: fallbackState()

    function fallbackState() {
        return {
            "dayLabel": "Lualand Next",
            "updatedAt": "sample",
            "bar": {
                "time": "--:--",
                "date": "Lualand",
                "workspace": "--",
                "workstation": "any",
                "block": "No block"
            },
            "bars": {},
            "gm": {
                "title": "GM",
                "line1": "passive state",
                "line2": "no live polling",
                "status": "ready"
            },
            "activeBlock": {
                "name": "Idle",
                "time": "--:--",
                "workstation": "any",
                "remainingText": "--m",
                "debtText": "0m debt"
            },
            "timer": {
                "state": "idle",
                "primaryAction": "none",
                "primaryLabel": "",
                "remainingText": "",
                "debtText": "0m debt"
            },
            "workstations": [{
                "id": "code",
                "label": "Code",
                "short": "C",
                "range": "11-20",
                "active": true
            }],
            "timeline": [{
                "time": "--:--",
                "title": "Waiting for exported state",
                "workstation": "any",
                "status": "active",
                "remainingText": "--m"
            }],
            "tasks": [{
                "title": "export view-state.json",
                "done": false
            }]
        };
    }

    function normalizeObject(value, fallback) {
        return value && typeof value === "object" ? value : fallback;
    }

    function normalizeArray(value, fallback) {
        return Array.isArray(value) && value.length > 0 ? value : fallback;
    }

    function normalizeState(raw) {
        const fallback = fallbackState();
        if (!raw || typeof raw !== "object")
            return fallback;

        return {
            "dayLabel": String(raw.dayLabel || fallback.dayLabel),
            "updatedAt": String(raw.updatedAt || fallback.updatedAt),
            "bar": normalizeObject(raw.bar, fallback.bar),
            "bars": normalizeObject(raw.bars, fallback.bars),
            "gm": normalizeObject(raw.gm, fallback.gm),
            "activeBlock": normalizeObject(raw.activeBlock, fallback.activeBlock),
            "timer": normalizeObject(raw.timer, fallback.timer),
            "workstations": normalizeArray(raw.workstations, fallback.workstations),
            "timeline": normalizeArray(raw.timeline, fallback.timeline),
            "tasks": Array.isArray(raw.tasks) ? raw.tasks : fallback.tasks
        };
    }

    function reloadState() {
        try {
            const text = stateFile.text();
            if (!text || text.trim() === "") {
                shellState = fallbackState();
                return ;
            }
            shellState = normalizeState(JSON.parse(text));
        } catch (error) {
            console.warn("lualand-next: failed to load state from", statePath, error);
            shellState = fallbackState();
        }
    }

    function sidePanelScreens() {
        const screens = Quickshell.screens;
        if (!screens || screens.length === 0)
            return [];

        if (sideTargetScreen === "all")
            return screens;

        const exact = screens.filter(screen => screen.name === sideTargetScreen);
        if (exact.length > 0)
            return exact;

        const splitRight = screens.filter(screen => String(screen.name).endsWith("~2"));
        if (splitRight.length > 0)
            return splitRight;

        return [screens[screens.length - 1]];
    }

    function gmScreens() {
        const screens = Quickshell.screens;
        if (!screens || screens.length === 0)
            return [];

        if (gmTargetScreen === "all")
            return screens;

        const exact = screens.filter(screen => screen.name === gmTargetScreen);
        if (exact.length > 0)
            return exact;

        const laptop = screens.filter(screen => String(screen.name).indexOf("eDP") === 0);
        if (laptop.length > 0)
            return [laptop[0]];

        return [screens[0]];
    }

    function barScreens() {
        const screens = Quickshell.screens;
        if (!screens || screens.length === 0)
            return [];

        const target = Quickshell.env("LUALAND_NEXT_BAR_SCREENS") || "main";
        if (target === "all")
            return screens;

        if (target !== "main") {
            const names = target.split(",").map(name => name.trim()).filter(name => name !== "");
            const exact = screens.filter(screen => names.indexOf(screen.name) !== -1);
            if (exact.length > 0)
                return exact;
        }

        const mainScreens = screens.filter(screen => !String(screen.name).endsWith("~2"));
        return mainScreens.length > 0 ? mainScreens : screens;
    }

    Component.onCompleted: reloadState()

    FileView {
        id: stateFile

        path: root.statePath
        preload: true
        blockLoading: true
        watchChanges: true
        onLoaded: root.reloadState()
        onLoadFailed: root.shellState = root.fallbackState()
        onFileChanged: {
            reload();
            root.reloadState();
        }
    }

    Variants {
        model: root.barScreens()

        PanelWindow {
            id: topPanel

            required property var modelData

            screen: modelData
            implicitHeight: root.barHeight
            color: "transparent"
            aboveWindows: true
            focusable: false
            exclusionMode: ExclusionMode.Auto
            WlrLayershell.namespace: "lualand-next:bar:" + (modelData ? modelData.name : "screen")
            WlrLayershell.layer: WlrLayer.Top

            anchors {
                top: true
                left: true
                right: true
            }

            LualandNext.TopBar {
                anchors.fill: parent
                colors: root.colors
                bar: root.shellState.bar || ({})
                screenLabel: topPanel.modelData ? topPanel.modelData.name : "screen"
            }
        }
    }

    Variants {
        model: root.sidePanelScreens()

        PanelWindow {
            id: panel

            required property var modelData

            screen: modelData
            implicitWidth: root.panelWidth
            implicitHeight: root.panelHeight
            color: "transparent"
            aboveWindows: true
            focusable: false
            exclusionMode: ExclusionMode.Auto
            WlrLayershell.namespace: "lualand-next:side:" + (modelData ? modelData.name : "screen")
            WlrLayershell.layer: WlrLayer.Top

            anchors {
                top: true
                right: true
                bottom: true
            }

            margins {
                top: root.barHeight
            }

            LualandNext.SidePanel {
                anchors.fill: parent
                colors: root.colors
                shellState: root.shellState
                screenLabel: panel.modelData ? panel.modelData.name : "screen"
                statePath: root.statePath
                actionScript: root.actionScript
            }
        }
    }

    Variants {
        model: root.gmScreens()

        PanelWindow {
            id: gmPanel

            required property var modelData

            screen: modelData
            implicitHeight: root.gmHeight
            color: "transparent"
            aboveWindows: true
            focusable: false
            exclusionMode: ExclusionMode.Auto
            WlrLayershell.namespace: "lualand-next:gm:" + (modelData ? modelData.name : "screen")
            WlrLayershell.layer: WlrLayer.Top

            anchors {
                top: true
                left: true
                right: true
            }

            margins {
                top: root.barHeight
            }

            LualandNext.GmWidget {
                anchors.fill: parent
                anchors.margins: 8
                colors: root.colors
                gm: root.shellState.gm || ({})
                dayLabel: root.shellState.dayLabel || "Lualand Next"
                updatedAt: root.shellState.updatedAt || ""
            }
        }
    }
}
