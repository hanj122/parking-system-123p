package carpark;

import javax.swing.*;
import javax.swing.table.DefaultTableModel;
import java.awt.*;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;

public class MainControlFrame extends JFrame implements ParkingLotListener {

    private final ParkingLot parkingLot;
    private final DateTimeFormatter dtFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");

    // Gate Control Components
    private JButton dispenseButton;
    private JTextField entryTimeField;
    private JComboBox<String> ticketCombo;
    private JTextField exitTimeField;
    private JButton exitButton;

    // Monitor Components
    private JLabel totalLabel;
    private JLabel occupiedLabel;
    private JLabel availableLabel;
    private DefaultTableModel tableModel;
    private JTable ticketTable;

    public MainControlFrame(ParkingLot parkingLot) {
        super("Main Control (Gate & Monitor)");
        this.parkingLot = parkingLot;
        parkingLot.addListener(this);

        setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);
        setSize(800, 500);
        setLayout(new BorderLayout(10, 10));
        setLocationRelativeTo(null);

        // --- Left Panel: Gate Control ---
        JPanel leftPanel = new JPanel(new GridLayout(2, 1, 10, 10));
        leftPanel.setPreferredSize(new Dimension(350, 0));

        // Entry Panel
        JPanel entryPanel = new JPanel(new GridBagLayout());
        entryPanel.setBorder(BorderFactory.createTitledBorder("Entry / Dispense Card"));
        GridBagConstraints gbc = new GridBagConstraints();
        gbc.insets = new Insets(5, 5, 5, 5);
        gbc.fill = GridBagConstraints.HORIZONTAL;

        gbc.gridx = 0; gbc.gridy = 0;
        entryPanel.add(new JLabel("Entry Time:"), gbc);

        gbc.gridx = 1; gbc.gridy = 0;
        entryTimeField = new JTextField(15);
        entryTimeField.setText(LocalDateTime.now().format(dtFormatter));
        entryPanel.add(entryTimeField, gbc);
        
        gbc.gridx = 1; gbc.gridy = 1;
        dispenseButton = new JButton("Dispense Card");
        entryPanel.add(dispenseButton, gbc);

        // Exit Panel
        JPanel exitPanel = new JPanel(new GridBagLayout());
        exitPanel.setBorder(BorderFactory.createTitledBorder("Exit / Payment"));
        
        gbc.gridx = 0; gbc.gridy = 0;
        exitPanel.add(new JLabel("Select Ticket:"), gbc);
        
        gbc.gridx = 1; gbc.gridy = 0;
        ticketCombo = new JComboBox<>();
        exitPanel.add(ticketCombo, gbc);

        gbc.gridx = 0; gbc.gridy = 1;
        exitPanel.add(new JLabel("Exit Time:"), gbc);

        gbc.gridx = 1; gbc.gridy = 1;
        exitTimeField = new JTextField(15);
        exitTimeField.setText(LocalDateTime.now().format(dtFormatter));
        exitPanel.add(exitTimeField, gbc);

        gbc.gridx = 1; gbc.gridy = 2;
        exitButton = new JButton("Process Exit");
        exitPanel.add(exitButton, gbc);

        leftPanel.add(entryPanel);
        leftPanel.add(exitPanel);

        // --- Right Panel: Monitor ---
        JPanel rightPanel = new JPanel(new BorderLayout(5, 5));
        
        JPanel statusPanel = new JPanel(new GridLayout(1, 3, 5, 5));
        statusPanel.setBorder(BorderFactory.createTitledBorder("Parking Status"));
        
        totalLabel = new JLabel("Total: -");
        occupiedLabel = new JLabel("Occupied: -");
        availableLabel = new JLabel("Available: -");
        
        statusPanel.add(totalLabel);
        statusPanel.add(occupiedLabel);
        statusPanel.add(availableLabel);

        tableModel = new DefaultTableModel(new Object[]{"Card ID", "Entry Time"}, 0) {
            @Override
            public boolean isCellEditable(int row, int column) {
                return false;
            }
        };
        ticketTable = new JTable(tableModel);
        JScrollPane scrollPane = new JScrollPane(ticketTable);
        scrollPane.setBorder(BorderFactory.createTitledBorder("Active Tickets"));

        rightPanel.add(statusPanel, BorderLayout.NORTH);
        rightPanel.add(scrollPane, BorderLayout.CENTER);

        // History Button
        JButton historyButton = new JButton("Preview History");
        historyButton.addActionListener(e -> {
            TransactionHistoryDialog dialog = new TransactionHistoryDialog(this);
            dialog.setVisible(true);
        });
        JPanel rightSouthPanel = new JPanel(new FlowLayout(FlowLayout.RIGHT));
        rightSouthPanel.add(historyButton);
        rightPanel.add(rightSouthPanel, BorderLayout.SOUTH);

        // --- Add to Frame ---
        add(leftPanel, BorderLayout.WEST);
        add(rightPanel, BorderLayout.CENTER);

        // Actions
        dispenseButton.addActionListener(e -> handleDispense());
        exitButton.addActionListener(e -> handleExit());
    }

    private void handleDispense() {
        try {
            LocalDateTime entryTime = LocalDateTime.parse(entryTimeField.getText().trim(), dtFormatter);
            if (parkingLot.isFull()) {
                JOptionPane.showMessageDialog(this, "Parking is Full!", "Error", JOptionPane.ERROR_MESSAGE);
                return;
            }
            Ticket t = parkingLot.dispenseCard(entryTime);
            if (t != null) {
                JOptionPane.showMessageDialog(this, "Card dispensed: " + t.getId(), "Success", JOptionPane.INFORMATION_MESSAGE);
            }
            entryTimeField.setText(LocalDateTime.now().format(dtFormatter));
        } catch (DateTimeParseException ex) {
            JOptionPane.showMessageDialog(this, "Invalid Entry Time format. Use yyyy-MM-dd HH:mm", "Error", JOptionPane.ERROR_MESSAGE);
        }
    }

    private void handleExit() {
        String selectedTicketId = (String) ticketCombo.getSelectedItem();
        if (selectedTicketId == null) {
            JOptionPane.showMessageDialog(this, "No ticket selected.", "Error", JOptionPane.WARNING_MESSAGE);
            return;
        }

        try {
            LocalDateTime exitTime = LocalDateTime.parse(exitTimeField.getText().trim(), dtFormatter);
            Ticket t = parkingLot.getTicket(selectedTicketId);
            
            if (t == null) {
                JOptionPane.showMessageDialog(this, "Ticket not found.", "Error", JOptionPane.ERROR_MESSAGE);
                return;
            }

            try {
                FeeCalculator.FeeResult result = FeeCalculator.calculateFee(t.getEntryTime(), exitTime);
                
                if (result.towed) {
                    JOptionPane.showMessageDialog(this, "Vehicle has been parked for >= 24 hours.\nStatus marked as TOWED.\nNo fee calculated.", "TOWED", JOptionPane.WARNING_MESSAGE);
                    parkingLot.processExit(selectedTicketId, exitTime, Ticket.Status.TOWED);
                    
                    TransactionLogger.logTransaction(
                        selectedTicketId, t.getEntryTime(), exitTime, "TOWED", 0, 0, 0
                    );
                } else {
                    PaymentDialog pd = new PaymentDialog(this, result.fee);
                    pd.setVisible(true);
                    if (pd.isPaymentSuccessful()) {
                        parkingLot.processExit(selectedTicketId, exitTime, Ticket.Status.PAID);
                        
                        TransactionLogger.logTransaction(
                            selectedTicketId, t.getEntryTime(), exitTime, "PAID", 
                            result.fee, pd.getTenderedAmount(), pd.getChangeGiven()
                        );
                    }
                }
                
                exitTimeField.setText(LocalDateTime.now().format(dtFormatter));

            } catch (IllegalArgumentException ex) {
                JOptionPane.showMessageDialog(this, ex.getMessage(), "Error", JOptionPane.ERROR_MESSAGE);
            }

        } catch (DateTimeParseException ex) {
            JOptionPane.showMessageDialog(this, "Invalid Exit Time format. Use yyyy-MM-dd HH:mm", "Error", JOptionPane.ERROR_MESSAGE);
        }
    }

    @Override
    public void onParkingEvent(ParkingEvent event) {
        // Update dispense button state
        if (event.getAvailableSlots() == 0) {
            dispenseButton.setEnabled(false);
            dispenseButton.setText("Full");
        } else {
            dispenseButton.setEnabled(true);
            dispenseButton.setText("Dispense Card");
        }

        // Update ticket combo box
        String selected = (String) ticketCombo.getSelectedItem();
        ticketCombo.removeAllItems();
        for (Ticket t : event.getActiveTicketsSnapshot()) {
            ticketCombo.addItem(t.getId());
        }
        
        if (selected != null) {
            boolean exists = event.getActiveTicketsSnapshot().stream().anyMatch(t -> t.getId().equals(selected));
            if (exists) {
                ticketCombo.setSelectedItem(selected);
            }
        }

        // Update monitor stats
        totalLabel.setText("Total: " + event.getTotalCapacity());
        occupiedLabel.setText("Occupied: " + event.getOccupiedSlots());
        availableLabel.setText("Available: " + event.getAvailableSlots());

        if (event.getAvailableSlots() == 0) {
            availableLabel.setForeground(Color.RED);
        } else {
            availableLabel.setForeground(Color.BLACK);
        }

        // Update monitor table
        tableModel.setRowCount(0);
        for (Ticket t : event.getActiveTicketsSnapshot()) {
            tableModel.addRow(new Object[]{
                t.getId(),
                t.getEntryTime().format(dtFormatter)
            });
        }
    }
}

