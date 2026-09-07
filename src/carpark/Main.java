package carpark;

import javax.swing.SwingUtilities;

public class Main {
    public static void main(String[] args) {
        SwingUtilities.invokeLater(() -> {
            ParkingLot parkingLot = new ParkingLot();
            
            MainControlFrame mainFrame = new MainControlFrame(parkingLot);
            OutsideDisplayFrame outsideFrame = new OutsideDisplayFrame(parkingLot);
            
            mainFrame.setVisible(true);
            outsideFrame.setVisible(true);
        });
    }
}

