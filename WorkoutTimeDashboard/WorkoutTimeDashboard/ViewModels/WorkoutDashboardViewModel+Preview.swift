import Foundation
import HealthKit

extension WorkoutDashboardViewModel {
    static var preview: WorkoutDashboardViewModel {
        let vm = WorkoutDashboardViewModel(healthKitManager: PreviewHealthKitManager())
        vm.summaries = PreviewHealthKitManager.sampleData
        vm.state = .loaded
        vm.selectedFilter = .thirtyDays
        vm.chartUnit = .hours
        return vm
    }
}

private final class PreviewHealthKitManager: HealthKitManaging {
    static let sampleData: [WorkoutSummary] = [
        .init(categoryKey: "1", activityType: .cycling, friendlyName: "Indoor Cycling", workoutCount: 12, totalDuration: 10 * 3600),
        .init(categoryKey: "2", activityType: .walking, friendlyName: "Outdoor Walking", workoutCount: 20, totalDuration: 8.5 * 3600),
        .init(categoryKey: "3", activityType: .running, friendlyName: "Outdoor Running", workoutCount: 9, totalDuration: 6.25 * 3600),
        .init(categoryKey: "4", activityType: .hiking, friendlyName: "Hiking", workoutCount: 4, totalDuration: 5 * 3600),
        .init(categoryKey: "5", activityType: .traditionalStrengthTraining, friendlyName: "Strength Training", workoutCount: 15, totalDuration: 4.75 * 3600)
    ]

    var isHealthDataAvailable: Bool { true }

    func requestAuthorization() async throws -> Bool { true }

    func fetchWorkoutSummaries(startDate: Date?) async throws -> [WorkoutSummary] {
        sampleData
    }
}
