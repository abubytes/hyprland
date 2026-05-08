import QtQuick
import QtQuick.Layouts

Rectangle {
    id: root

    required property var colors
    required property int index
    property var entry: ({})
    readonly property bool active: entry.status === "active"
    readonly property bool done: entry.status === "done"

    implicitHeight: 20
    color: active ? root.colors.surface2 : (index % 2 === 0 ? root.colors.paper : root.colors.surface)
    border.color: "transparent"
    border.width: 0

    RowLayout {
        anchors.fill: parent
        anchors.leftMargin: 3
        anchors.rightMargin: 3
        spacing: 3

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
            Layout.preferredWidth: 42
            color: root.colors.accent
            font.family: "monospace"
            font.pixelSize: 9
            horizontalAlignment: Text.AlignRight
            elide: Text.ElideRight
            text: root.entry.remainingText || ""
        }
    }
}
