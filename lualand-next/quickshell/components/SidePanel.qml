import QtQuick
import QtQuick.Layouts

Item {
    id: root

    required property var colors
    required property var shellState
    property string actionScript: ""
    readonly property var state: shellState || ({})
    readonly property var activeBlock: state.activeBlock || ({})
    readonly property var timer: state.timer || ({})
    readonly property var workstations: Array.isArray(state.workstations) ? state.workstations : []
    readonly property var timeline: Array.isArray(state.timeline) ? state.timeline : []
    readonly property var tasks: Array.isArray(state.tasks) ? state.tasks : []

    RowLayout {
        anchors.fill: parent
        anchors.margins: 0
        spacing: 0

        ColumnLayout {
            Layout.fillWidth: true
            Layout.fillHeight: true
            spacing: 0

            BlockSummary {
                Layout.fillWidth: true
                Layout.preferredHeight: 50
                colors: root.colors
                block: root.activeBlock
                timer: root.timer
                actionScript: root.actionScript
            }

            TaskList {
                Layout.fillWidth: true
                Layout.preferredHeight: 112
                colors: root.colors
                tasks: root.tasks
            }

            Flickable {
                id: timelineFlick

                Layout.fillWidth: true
                Layout.fillHeight: true
                Layout.minimumHeight: 180
                clip: true
                boundsBehavior: Flickable.StopAtBounds
                contentWidth: width
                contentHeight: timelineColumn.implicitHeight
                readonly property real scrollRange: Math.max(0, contentHeight - height)
                readonly property real scrollProgress: scrollRange <= 0
                    ? 0
                    : Math.max(0, Math.min(1, contentY / scrollRange))

                Column {
                    id: timelineColumn

                    width: Math.max(1, timelineFlick.width - 1)
                    spacing: 0

                    Repeater {
                        model: root.timeline

                        TimelineRow {
                            required property var modelData

                            width: timelineColumn.width
                            colors: root.colors
                            entry: modelData || ({})
                        }
                    }
                }

                Rectangle {
                    anchors.top: parent.top
                    anchors.right: parent.right
                    width: 1
                    height: timelineFlick.scrollRange <= 0 ? 0 : Math.max(2, timelineFlick.height * timelineFlick.scrollProgress)
                    color: root.colors.accent
                    visible: timelineFlick.scrollRange > 0
                }
            }
        }

        WorkstationRail {
            Layout.preferredWidth: 86
            Layout.fillHeight: true
            colors: root.colors
            workstations: root.workstations
        }
    }
}
