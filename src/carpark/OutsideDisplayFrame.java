package carpark;

import javax.swing.*;
import java.awt.*;

public class OutsideDisplayFrame extends JFrame implements ParkingLotListener {

    private JLabel displayLabel;

    public OutsideDisplayFrame(ParkingLot parkingLot) {
        super("Outside Display");
        parkingLot.addListener(this);

        setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);
        setSize(400, 200);
        setLayout(new BorderLayout());
        setLocation(100, 600); // place below Main Control

        displayLabel = new JLabel("AVAILABLE SLOTS: -- / 120", SwingConstants.CENTER);
        displayLabel.setFont(new Font("Arial", Font.BOLD, 24));
        displayLabel.setForeground(Color.GREEN);
        
        // Add a clean minimal background
        getContentPane().setBackground(Color.BLACK);
        
        add(displayLabel, BorderLayout.CENTER);
    }

    @Override
    public void onParkingEvent(ParkingEvent event) {
        int available = event.getAvailableSlots();
        int total = event.getTotalCapacity();
        
        displayLabel.setText(String.format("AVAILABLE SLOTS: %02d / %d", available, total));
        
        if (available == 0) {
            displayLabel.setForeground(Color.RED);
            displayLabel.setText("FULL");
        } else if (available <= 10) {
            displayLabel.setForeground(Color.ORANGE);
        } else {
            displayLabel.setForeground(Color.GREEN);
        }
    }
}

