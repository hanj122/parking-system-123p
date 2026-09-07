package carpark;

import java.util.List;

public class ParkingEvent {
    public enum Type { ENTER, EXIT }
    
    private final Type type;
    private final Ticket ticket;
    private final int totalCapacity;
    private final int occupiedSlots;
    private final int availableSlots;
    private final List<Ticket> activeTicketsSnapshot;

    public ParkingEvent(Type type, Ticket ticket, int totalCapacity, int occupiedSlots, int availableSlots, List<Ticket> activeTicketsSnapshot) {
        this.type = type;
        this.ticket = ticket;
        this.totalCapacity = totalCapacity;
        this.occupiedSlots = occupiedSlots;
        this.availableSlots = availableSlots;
        this.activeTicketsSnapshot = activeTicketsSnapshot;
    }

    public Type getType() {
        return type;
    }

    public Ticket getTicket() {
        return ticket;
    }

    public int getTotalCapacity() {
        return totalCapacity;
    }

    public int getOccupiedSlots() {
        return occupiedSlots;
    }

    public int getAvailableSlots() {
        return availableSlots;
    }

    public List<Ticket> getActiveTicketsSnapshot() {
        return activeTicketsSnapshot;
    }
}

