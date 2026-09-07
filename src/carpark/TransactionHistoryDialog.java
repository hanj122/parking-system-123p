package carpark;

import javax.swing.*;
import javax.swing.table.DefaultTableModel;
import java.awt.*;
import java.util.List;

public class TransactionHistoryDialog extends JDialog {

    public TransactionHistoryDialog(Frame owner) {
        super(owner, "Transaction History", true);
        setSize(800, 400);
        setLocationRelativeTo(owner);
        setLayout(new BorderLayout());

        List<String> lines = TransactionLogger.readTransactions();
        
        if (lines.isEmpty()) {
            add(new JLabel("No transactions found.", SwingConstants.CENTER), BorderLayout.CENTER);
            return;
        }

        // The first line is the header
        String[] headers = lines.get(0).split(",");
        DefaultTableModel model = new DefaultTableModel(headers, 0) {
            @Override
            public boolean isCellEditable(int row, int column) {
                return false;
            }
        };

        // Subsequent lines are data
        for (int i = 1; i < lines.size(); i++) {
            // Use a simple split. In a real robust CSV parser, we'd handle commas inside quotes.
            // Since our logger doesn't generate quotes and commas inside fields, this is fine.
            model.addRow(lines.get(i).split(","));
        }

        JTable table = new JTable(model);
        JScrollPane scrollPane = new JScrollPane(table);
        add(scrollPane, BorderLayout.CENTER);
        
        JButton closeButton = new JButton("Close");
        closeButton.addActionListener(e -> dispose());
        JPanel bottomPanel = new JPanel(new FlowLayout(FlowLayout.RIGHT));
        bottomPanel.add(closeButton);
        add(bottomPanel, BorderLayout.SOUTH);
    }
}

