import Foundation
import HealthKit

protocol HealthKitManaging {
    var isHealthDataAvailable: Bool { get }
    func requestAuthorization() async throws -> Bool
    func fetchWorkoutSummaries(startDate: Date?) async throws -> [WorkoutSummary]
}

final class HealthKitManager: HealthKitManaging {
    private let healthStore = HKHealthStore()

    var isHealthDataAvailable: Bool {
        HKHealthStore.isHealthDataAvailable()
    }

    func requestAuthorization() async throws -> Bool {
        guard isHealthDataAvailable else { return false }
        let workoutType = HKObjectType.workoutType()

        return try await withCheckedThrowingContinuation { continuation in
            healthStore.requestAuthorization(toShare: [], read: [workoutType]) { success, error in
                if let error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume(returning: success)
                }
            }
        }
    }

    func fetchWorkoutSummaries(startDate: Date?) async throws -> [WorkoutSummary] {
        let workouts = try await fetchWorkouts(startDate: startDate)
        return Self.aggregate(workouts: workouts)
    }

    private func fetchWorkouts(startDate: Date?) async throws -> [HKWorkout] {
        let predicate = startDate.map {
            HKQuery.predicateForSamples(withStart: $0, end: Date(), options: .strictStartDate)
        }

        let sortDescriptor = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)

        return try await withCheckedThrowingContinuation { continuation in
            let query = HKSampleQuery(
                sampleType: HKObjectType.workoutType(),
                predicate: predicate,
                limit: HKObjectQueryNoLimit,
                sortDescriptors: [sortDescriptor]
            ) { _, samples, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }

                continuation.resume(returning: (samples as? [HKWorkout]) ?? [])
            }

            healthStore.execute(query)
        }
    }

    static func aggregate(workouts: [HKWorkout]) -> [WorkoutSummary] {
        let grouped = Dictionary(grouping: workouts, by: workoutCategoryKey(for:))

        return grouped.compactMap { key, groupedWorkouts in
            guard let firstWorkout = groupedWorkouts.first else { return nil }
            let totalDuration = groupedWorkouts.reduce(0) { $0 + $1.duration }
            guard totalDuration > 0 else { return nil }

            return WorkoutSummary(
                categoryKey: key,
                activityType: firstWorkout.workoutActivityType,
                friendlyName: friendlyName(for: firstWorkout),
                workoutCount: groupedWorkouts.count,
                totalDuration: totalDuration
            )
        }
        .sorted { $0.totalDuration > $1.totalDuration }
    }

    private static func workoutCategoryKey(for workout: HKWorkout) -> String {
        "\(workout.workoutActivityType.rawValue)-\(isIndoorWorkout(workout) ? "indoor" : "outdoor")"
    }

    private static func isIndoorWorkout(_ workout: HKWorkout) -> Bool {
        (workout.metadata?[HKMetadataKeyIndoorWorkout] as? NSNumber)?.boolValue ?? false
    }

    private static func friendlyName(for workout: HKWorkout) -> String {
        let activityType = workout.workoutActivityType
        let indoor = isIndoorWorkout(workout)

        switch activityType {
        case .running:
            return indoor ? "Indoor Running" : "Outdoor Running"
        case .walking:
            return indoor ? "Indoor Walking" : "Outdoor Walking"
        case .cycling:
            return indoor ? "Indoor Cycling" : "Outdoor Cycling"
        case .traditionalStrengthTraining:
            return "Strength Training"
        case .functionalStrengthTraining:
            return "Functional Strength"
        case .hiking:
            return "Hiking"
        case .swimming:
            return indoor ? "Pool Swimming" : "Open Water Swimming"
        case .yoga:
            return "Yoga"
        case .highIntensityIntervalTraining:
            return "HIIT"
        case .elliptical:
            return "Elliptical"
        case .rowing:
            return indoor ? "Indoor Rowing" : "Rowing"
        case .stairClimbing:
            return "Stair Climbing"
        case .cooldown:
            return "Cooldown"
        case .coreTraining:
            return "Core Training"
        case .flexibility:
            return "Flexibility"
        case .mixedCardio:
            return "Mixed Cardio"
        case .mindAndBody:
            return "Mind & Body"
        case .other:
            return "Other"
        default:
            return activityType.fallbackName
        }
    }
}

private extension HKWorkoutActivityType {
    var fallbackName: String {
        String(describing: self)
            .replacingOccurrences(of: "HKWorkoutActivityType", with: "")
            .replacingOccurrences(of: "_", with: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .capitalized
    }
}
