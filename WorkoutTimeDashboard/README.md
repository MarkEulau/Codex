# Workout Time Dashboard (SwiftUI + HealthKit)

This folder contains production-ready SwiftUI source files for an iPhone app named **Workout Time Dashboard**.

## What the app does
- Requests HealthKit read access for workouts.
- Loads `HKWorkout` entries from Apple Health.
- Aggregates durations by workout type (with indoor/outdoor split for supported types).
- Sorts workout categories by total duration descending.
- Supports date filters: **7D / 30D / 90D / All**.
- Toggles chart units: **Hours / Minutes**.
- Shows:
  - a bar chart (`Charts` framework)
  - a detailed list with workout type, count, and total duration.
- Handles states:
  - loading
  - no permission
  - no workout data
  - loaded
  - error

## Project setup in Xcode
1. Open Xcode and create a new project:
   - iOS App
   - Name: `WorkoutTimeDashboard`
   - Interface: SwiftUI
   - Language: Swift
2. Replace the generated app files with the code in `WorkoutTimeDashboard/WorkoutTimeDashboard`.
3. Ensure the deployment target is iOS 16+ (Apple Charts support).
4. In your target settings, add the **HealthKit** capability:
   - Select target → **Signing & Capabilities**
   - Click **+ Capability**
   - Add **HealthKit**
5. Build and run on a physical iPhone with Apple Health data.

## Required Info.plist entries
Add this key to your app target’s `Info.plist`:

- `NSHealthShareUsageDescription`
  - Example value: `Workout Time Dashboard reads your workout history to visualize exercise time by activity type.`

> You do not need write permission because this app only reads HealthKit workouts.

## Notes
- HealthKit data is unavailable in the iOS simulator.
- If permission was previously denied, users can enable it in the Health app or iOS Settings.
