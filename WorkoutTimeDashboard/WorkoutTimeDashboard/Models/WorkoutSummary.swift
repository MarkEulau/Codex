import Foundation
import HealthKit

struct WorkoutSummary: Identifiable, Hashable {
    let categoryKey: String
    let activityType: HKWorkoutActivityType
    let friendlyName: String
    let workoutCount: Int
    let totalDuration: TimeInterval

    var id: String { categoryKey }

    var totalMinutes: Double { totalDuration / 60.0 }
    var totalHours: Double { totalDuration / 3600.0 }

    var formattedDuration: String {
        let formatter = DateComponentsFormatter()
        formatter.allowedUnits = [.hour, .minute]
        formatter.unitsStyle = .abbreviated
        formatter.zeroFormattingBehavior = .dropAll
        return formatter.string(from: totalDuration) ?? "0m"
    }
}

enum ChartUnit: String, CaseIterable, Identifiable {
    case hours = "Hours"
    case minutes = "Minutes"

    var id: String { rawValue }

    func value(for summary: WorkoutSummary) -> Double {
        self == .hours ? summary.totalHours : summary.totalMinutes
    }

    var axisLabel: String {
        self == .hours ? "Total Hours" : "Total Minutes"
    }
}
