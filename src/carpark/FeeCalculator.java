package carpark;

import java.time.Duration;
import java.time.LocalDateTime;

public class FeeCalculator {

    public static class FeeResult {
        public final int fee;
        public final boolean towed;
        public final boolean overnight;

        public FeeResult(int fee, boolean towed, boolean overnight) {
            this.fee = fee;
            this.towed = towed;
            this.overnight = overnight;
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
            int standardFeeTo10PM = calculateStandardFee(entry, tenPM);
            return new FeeResult(300 + standardFeeTo10PM, false, true);
        } else {
            return new FeeResult(calculateStandardFee(entry, exit), false, false);
        }
    }

    /**
     * Standard Fee Rules:
     * - <= 3hrs elapsed: 50.
     * - > 3hrs: 50 + 20 per each FULL additional hour completed.
     */
    private static int calculateStandardFee(LocalDateTime entry, LocalDateTime exit) {
        long hours = Duration.between(entry, exit).toHours();
        if (hours <= 3) {
            return 50;
        } else {
            return (int) (50 + (hours - 3) * 20);
        }
    }
}

