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
        anchors.margins: 7
        spacing: 3

        RowLayout {
            Layout.fillWidth: true
            spacing: 6

            Text {
                Layout.fillWidth: true
                color: root.colors.ink
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

            Repeater {
                model: Math.max(1, Math.min(root.tasks.length, 7))

                Text {
                    required property int index
                    readonly property var task: root.tasks.length > 0 ? root.tasks[index] || ({}) : ({
                        "title": "waiting for tasks",
                        "done": false
                    })

                    width: parent ? parent.width : 0
                    height: 16
                    color: task.status === "active" || task.status === "in-progress" ? root.colors.accent : (task.done ? root.colors.muted : root.colors.ink)
                    font.family: "monospace"
                    font.pixelSize: 11
                    elide: Text.ElideRight
                    text: "- [" + (task.done ? "x" : " ") + "] " + (task.title || "Untitled task")
                }
            }
        }
    }
}
