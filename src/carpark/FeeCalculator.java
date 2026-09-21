package carpark;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.LocalTime;

public class FeeCalculator {

    // Time windows
    private static final LocalTime morning_peak_start = LocalTime.of(7, 0);
    private static final LocalTime morning_peak_end = LocalTime.of(10, 0);
    private static final LocalTime night_peak_start = LocalTime.of(17, 0);
    private static final LocalTime night_peak_end = LocalTime.of(20, 0);

    // Multiplier for peak hours
    private static final double peak_surge_multiplier = 1.5;

    public static class FeeResult {
        public final int fee;
        public final boolean towed;
        public final boolean overnight;

        public FeeResult(int fee, boolean towed, boolean overnight, boolean peakHour) {
            this.fee = fee;
            this.towed = towed;
            this.overnight = overnight;
            this.peakHour = peakHour;
        }
    }

    public static FeeResult calculateFee(LocalDateTime entry, LocalDateTime exit) {
        if (exit.isBefore(entry)) {
            throw new IllegalArgumentException("Exit time cannot be before entry time.");
        }
        
        Duration totalDuration = Duration.between(entry, exit);
        
        // If elapsed >= 24hrs: skip fee calc, mark ticket status "TOWED"
        if (totalDuration.toHours() >= 24) {
            return new FeeResult(0, true, false);
        }

        // If stay overlaps with the peak hours
        boolean PeakH = overlapsWithPeakHours(entry, exit);

        // Determine if stay crosses 10 PM.
        // We find the next 10 PM on or after the entry time.
        LocalDateTime tenPM = entry.toLocalDate().atTime(22, 0);
        if (tenPM.isBefore(entry) || tenPM.equals(entry)) {
            // If entry is exactly at or after 10 PM, the "next" 10 PM is on the following day.
            tenPM = tenPM.plusDays(1);
        }

        // It crosses 10 PM if the exit time is at or after that next 10 PM.
        boolean crosses10PM = !exit.isBefore(tenPM);

        if (crosses10PM) {
            // Overnight fee = 300 + standard fee computed for entry -> 10PM portion only.
            int standardFeeTo10PM = calculateStandardFee(entry, tenPM, PeakH);
            return new FeeResult(300 + standardFeeTo10PM, false, true, PeakH);
        } else {
            return new FeeResult(calculateStandardFee(entry, exit, PeakH), false, false);
        }
    }

    /**
     * Standard Fee Rules:
     * - <= 3hrs elapsed: 50.
     * - > 3hrs: 50 + 20 per each FULL additional hour completed.
     */
    private static int calculateStandardFee(LocalDateTime entry, LocalDateTime exit, boolean PeakH) {
        long hours = Duration.between(entry, exit).toHours();

        int baseRate = 50;
        int HourlyRate = 20;

        if (PeakH) {
            baseRate = (int) Math.round(baseRate * peak_surge_multiplier);
            HourlyRate = (int) Math.round(HourlyRate * peak_surge_multiplier)
        }

        if (hours <= 3) {
            return baseRate;
        } else {
            return (int) (baseRate + (hours - 3) * HourlyRate);
        }
    }

    private static boolean overlapsWithPeakHours(LocalDateTime entry, LocalDateTime exit) {
        LocalDateTime cursor = entry;

        while (cursor.isBefore(exit) || cursor.equals(exit)) {
            LocalTime time = cursor.toLocalTime();

            boolean MorningPeakH = (!time.isBefore(morning_peak_start)) && time.isBefore(morning_peak_end);
            boolean NightPeakH = (!time.isBefore(night_peak_start)) && time.isBefore(night_peak_end);

            if (MorningPeakH || NightPeakH) {
                return true;
            }

            cursor = cursor.plusMinutes(30);
        }
            return false;
        }
}


