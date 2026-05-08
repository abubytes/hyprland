import QtQuick
import QtQuick.Layouts

Rectangle {
    id: root

    required property var colors
    property var tasks: []

    color: root.colors.surface
    border.color: "transparent"
    border.width: 0

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 0
        spacing: 0

        Column {
            Layout.fillWidth: true
            Layout.fillHeight: true
            spacing: 0
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
                    height: 15
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
