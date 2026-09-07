package carpark;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import javax.swing.SwingUtilities;

public class ParkingLot {
    private final int capacity = 120;
    private final Map<String, Ticket> activeTickets = new LinkedHashMap<>();
    private final List<ParkingLotListener> listeners = new ArrayList<>();
    private int nextId = 1;

    public void addListener(ParkingLotListener listener) {
        listeners.add(listener);
        // Fire an initial event to populate the listener's UI
        fireEvent(new ParkingEvent(
                ParkingEvent.Type.ENTER, 
                null, 
                capacity, 
                getOccupiedSlots(), 
                getAvailableSlots(), 
                getActiveTickets()
        ));
    }

    public boolean isFull() {
        return activeTickets.size() >= capacity;
    }

    public int getAvailableSlots() {
        return capacity - activeTickets.size();
    }

    public int getOccupiedSlots() {
        return activeTickets.size();
    }

    public List<Ticket> getActiveTickets() {
        return new ArrayList<>(activeTickets.values());
    }
    
    public Ticket getTicket(String id) {
        return activeTickets.get(id);
    }

    public Ticket dispenseCard(LocalDateTime entryTime) {
        if (isFull()) {
            return null;
        }
        String id = "TKT-" + (nextId++);
        Ticket t = new Ticket(id, entryTime);
        activeTickets.put(id, t);
        
        fireEvent(new ParkingEvent(
                ParkingEvent.Type.ENTER, 
                t, 
                capacity, 
                getOccupiedSlots(), 
                getAvailableSlots(), 
                getActiveTickets()
        ));
        return t;
    }

    public void processExit(String id, LocalDateTime exitTime, Ticket.Status status) {
        Ticket t = activeTickets.get(id);
        if (t != null) {
            t.setExitTime(exitTime);
            t.setStatus(status);
            activeTickets.remove(id);
            
            fireEvent(new ParkingEvent(
                    ParkingEvent.Type.EXIT, 
                    t, 
                    capacity, 
                    getOccupiedSlots(), 
                    getAvailableSlots(), 
                    getActiveTickets()
            ));
        }
    }

    private void fireEvent(ParkingEvent event) {
        SwingUtilities.invokeLater(() -> {
            for (ParkingLotListener listener : listeners) {
                listener.onParkingEvent(event);
            }
        });
    }
}

