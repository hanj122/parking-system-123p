package carpark;

import javax.swing.*;
import java.awt.*;
import java.util.LinkedHashMap;
import java.util.Map;

public class PaymentDialog extends JDialog {
    private boolean paymentSuccessful = false;
    private int tenderedAmount = 0;
    private int changeGiven = 0;

    public PaymentDialog(Frame owner, int fee) {
        super(owner, "Payment", true);
        setLayout(new BorderLayout(10, 10));
        setSize(300, 200);
        setLocationRelativeTo(owner);

        JPanel mainPanel = new JPanel(new GridLayout(3, 1, 5, 5));
        mainPanel.setBorder(BorderFactory.createEmptyBorder(10, 10, 10, 10));

        JLabel feeLabel = new JLabel("Total Fee: ₱" + fee);
        feeLabel.setFont(new Font("Arial", Font.BOLD, 16));
        
        JPanel tenderPanel = new JPanel(new FlowLayout(FlowLayout.LEFT, 0, 0));
        tenderPanel.add(new JLabel("Tendered Amount: ₱"));
        JTextField tenderField = new JTextField(10);
        tenderPanel.add(tenderField);

        JButton payButton = new JButton("Pay");

        mainPanel.add(feeLabel);
        mainPanel.add(tenderPanel);
        mainPanel.add(payButton);

        add(mainPanel, BorderLayout.CENTER);

        payButton.addActionListener(e -> {
            try {
                int tendered = Integer.parseInt(tenderField.getText().trim());
                if (!isValidTender(tendered)) {
                    JOptionPane.showMessageDialog(this, 
                        "Invalid tendered amount. Must be a valid combo of ₱20/50/100/500/1000.", 
                        "Error", JOptionPane.ERROR_MESSAGE);
                    return;
                }

                if (tendered < fee) {
                    JOptionPane.showMessageDialog(this, 
                        "Tendered amount is less than the fee. Please provide more.", 
                        "Error", JOptionPane.ERROR_MESSAGE);
                    return;
                }

                int change = tendered - fee;
                Map<Integer, Integer> changeDenoms = calculateChange(change);
                
                StringBuilder sb = new StringBuilder("Payment successful!\n\n");
                sb.append("Change: ₱").append(change).append("\n");
                if (change > 0) {
                    sb.append("Breakdown:\n");
                    for (Map.Entry<Integer, Integer> entry : changeDenoms.entrySet()) {
                        sb.append("₱").append(entry.getKey()).append(" x ").append(entry.getValue()).append("\n");
                    }
                }
                
                JOptionPane.showMessageDialog(this, sb.toString(), "Success", JOptionPane.INFORMATION_MESSAGE);
                this.tenderedAmount = tendered;
                this.changeGiven = change;
                paymentSuccessful = true;
                dispose();

            } catch (NumberFormatException ex) {
                JOptionPane.showMessageDialog(this, "Please enter a valid integer amount.", "Error", JOptionPane.ERROR_MESSAGE);
            }
        });
    }

    public boolean isPaymentSuccessful() {
        return paymentSuccessful;
    }

    public int getTenderedAmount() {
        return tenderedAmount;
    }

    public int getChangeGiven() {
        return changeGiven;
    }

    private boolean isValidTender(int amount) {
        if (amount <= 0) return false;
        // The amount must be formable by 20, 50, 100, 500, 1000.
        // Since 100, 500, 1000 are multiples of 20 or 50, we just need to check if it's formable by 20 and 50.
        // Formable if amount % 10 == 0 and not 10 and not 30.
        return amount % 10 == 0 && amount != 10 && amount != 30;
    }

    private Map<Integer, Integer> calculateChange(int amount) {
        int[] denoms = {1000, 500, 100, 50, 20, 10, 5, 1}; // added smaller coins just in case
        Map<Integer, Integer> change = new LinkedHashMap<>();
        for (int d : denoms) {
            if (amount >= d) {
                int count = amount / d;
                change.put(d, count);
                amount %= d;
            }
        }
        return change;
    }
}

