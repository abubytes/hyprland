import QtQuick
import QtQuick.Layouts

Rectangle {
    id: root

    required property var colors
    property var entry: ({})
    readonly property var item: entry || ({})
    readonly property bool active: root.item.status === "active"
    readonly property bool done: root.item.status === "done"

    implicitHeight: 19
    color: active ? root.colors.surface2 : "transparent"
    border.width: 0

    RowLayout {
        anchors.fill: parent
        spacing: 3

        Text {
            Layout.preferredWidth: 34
            color: active ? root.colors.accent : root.colors.muted
            font.bold: active
            font.family: "monospace"
            font.pixelSize: 9
            elide: Text.ElideRight
            text: root.item.time || "--:--"
        }

        Text {
            Layout.preferredWidth: 18
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
            text: root.item.title || "Untitled block"
        }

        Text {
            Layout.preferredWidth: 40
            color: root.item.overrunText ? root.colors.bad : root.colors.accent
            font.family: "monospace"
            font.pixelSize: 9
            horizontalAlignment: Text.AlignRight
            elide: Text.ElideRight
            text: root.item.remainingText || root.item.overrunText || root.item.workstation || ""
        }
    }
}
