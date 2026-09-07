package carpark;

import java.time.LocalDateTime;

public class Ticket {
    public enum Status { ACTIVE, PAID, TOWED }

    private String id;
    private LocalDateTime entryTime;
    private LocalDateTime exitTime;
    private Status status;

    public Ticket(String id, LocalDateTime entryTime) {
        this.id = id;
        this.entryTime = entryTime;
        this.status = Status.ACTIVE;
    }

    public String getId() {
        return id;
    }

    public LocalDateTime getEntryTime() {
        return entryTime;
    }

    public LocalDateTime getExitTime() {
        return exitTime;
    }

    public void setExitTime(LocalDateTime exitTime) {
        this.exitTime = exitTime;
    }

    public Status getStatus() {
        return status;
    }

    public void setStatus(Status status) {
        this.status = status;
    }
}

