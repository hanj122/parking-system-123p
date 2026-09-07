package carpark;

import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.File;
import java.io.FileReader;
import java.io.FileWriter;
import java.io.IOException;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;

public class TransactionLogger {

    private static final String DIR_PATH = "data";
    private static final String FILE_PATH = DIR_PATH + "/transactions.csv";
    private static final DateTimeFormatter dtFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");

    public static void logTransaction(String cardId, LocalDateTime entryTime, LocalDateTime exitTime, 
                                      String status, int feeCharged, int amountReceived, int changeGiven) {
        File dir = new File(DIR_PATH);
        if (!dir.exists()) {
            dir.mkdirs();
        }

        File file = new File(FILE_PATH);
        boolean fileExists = file.exists();

        try (BufferedWriter writer = new BufferedWriter(new FileWriter(file, true))) {
            if (!fileExists) {
                writer.write("card ID,entry time,exit time,duration,status,fee charged,amount received,change given\n");
            }
            
            String entryStr = entryTime.format(dtFormatter);
            String exitStr = exitTime.format(dtFormatter);
            
            Duration duration = Duration.between(entryTime, exitTime);
            long hours = duration.toHours();
            long minutes = duration.toMinutes() % 60;
            String durationStr = String.format("%02d:%02d", hours, minutes);
            
            writer.write(String.format("%s,%s,%s,%s,%s,%d,%d,%d\n",
                    cardId, entryStr, exitStr, durationStr, status, feeCharged, amountReceived, changeGiven));
        } catch (IOException e) {
            System.err.println("Failed to log transaction: " + e.getMessage());
        }
    }

    public static List<String> readTransactions() {
        List<String> transactions = new ArrayList<>();
        File file = new File(FILE_PATH);
        if (!file.exists()) {
            return transactions;
        }
        
        try (BufferedReader reader = new BufferedReader(new FileReader(file))) {
            String line;
            while ((line = reader.readLine()) != null) {
                transactions.add(line);
            }
        } catch (IOException e) {
            System.err.println("Failed to read transactions: " + e.getMessage());
        }
        return transactions;
    }
}

