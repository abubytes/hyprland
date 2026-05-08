import QtQuick
import QtQuick.Layouts

Rectangle {
    id: root

    required property var colors
    property var entry: ({})
    readonly property bool active: entry.status === "active"
    readonly property bool done: entry.status === "done"

    implicitHeight: 24
    color: active ? root.colors.surface2 : "transparent"
    border.color: "transparent"
    border.width: 0

    RowLayout {
        anchors.fill: parent
        anchors.leftMargin: 4
        anchors.rightMargin: 4
        spacing: 4

        Text {
            Layout.preferredWidth: 38
            color: active ? root.colors.accent : root.colors.muted
            font.bold: active
            font.family: "monospace"
            font.pixelSize: 9
            elide: Text.ElideRight
            text: root.entry.time || "--:--"
        }

        Text {
            Layout.preferredWidth: 24
            color: done ? root.colors.good : (active ? root.colors.accent : root.colors.muted)
            font.family: "monospace"
            font.pixelSize: 9
            text: done ? "[x]" : (active ? "[>]" : "[ ]")
        }

        Text {
            Layout.fillWidth: true
            color: active ? root.colors.ink : root.colors.muted
            font.bold: active
            font.pixelSize: 10
            elide: Text.ElideRight
            text: root.entry.title || "Untitled"
        }

        Text {
            Layout.preferredWidth: 48
            color: root.entry.debtText ? root.colors.bad : root.colors.accent
            font.family: "monospace"
            font.pixelSize: 9
            horizontalAlignment: Text.AlignRight
            elide: Text.ElideRight
            text: root.entry.remainingText || root.entry.debtText || root.entry.workstation || ""
        }
    }
}
