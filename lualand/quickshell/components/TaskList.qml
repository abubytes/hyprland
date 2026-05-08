import QtQuick
import QtQuick.Layouts

Rectangle {
    id: root

    required property var colors
    property var tasks: []

    color: root.colors.surface
    border.color: root.colors.line
    border.width: 1

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 6
        spacing: 3

        RowLayout {
            Layout.fillWidth: true
            spacing: 6

            Text {
                Layout.fillWidth: true
                color: root.colors.muted
                font.bold: true
                font.family: "monospace"
                font.pixelSize: 10
                text: "tasks"
            }

            Text {
                color: root.colors.accent
                font.family: "monospace"
                font.pixelSize: 10
                text: root.tasks.length + ""
            }
        }

        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: 1
            color: root.colors.line
        }

        Column {
            Layout.fillWidth: true
            Layout.fillHeight: true
            spacing: 1
            clip: true
            visible: root.tasks.length > 0

            Repeater {
                model: Math.min(root.tasks.length, 7)

                Text {
                    required property int index
                    readonly property var task: root.tasks[index] || ({})

                    width: parent ? parent.width : 0
                    height: 16
                    color: task.status === "in-progress" ? root.colors.accent : (task.done ? root.colors.muted : root.colors.ink)
                    font.family: "monospace"
                    font.pixelSize: 11
                    elide: Text.ElideRight
                    text: "- [" + (task.done ? "x" : " ") + "] " + (task.title || "Untitled task")
                }
            }
        }

        Text {
            Layout.fillWidth: true
            Layout.fillHeight: true
            visible: root.tasks.length === 0
            color: root.colors.muted
            font.family: "monospace"
            font.pixelSize: 11
            wrapMode: Text.WordWrap
            text: "- [ ] emulate task list"
        }
    }
}
