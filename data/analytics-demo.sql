-- Demo dataset for ParkWise analytics
-- Date: 2026-09-22

DELETE FROM tickets
WHERE entry_time LIKE '2026-09-22%'
   OR exit_time LIKE '2026-09-22%';

-- Space 100

INSERT INTO tickets
(slot_id, entry_time, exit_time, status, fee)
VALUES
(100, '2026-09-22T08:00:00', '2026-09-22T09:00:00', 'completed', 50),
(100, '2026-09-22T10:00:00', '2026-09-22T11:00:00', 'completed', 50),
(100, '2026-09-22T13:00:00', '2026-09-22T14:00:00', 'completed', 50),
(100, '2026-09-22T15:00:00', '2026-09-22T17:00:00', 'completed', 70);

-- Space 101

INSERT INTO tickets
(slot_id, entry_time, exit_time, status, fee)
VALUES
(101, '2026-09-22T08:00:00', '2026-09-22T10:00:00', 'completed', 50),
(101, '2026-09-22T12:00:00', '2026-09-22T15:00:00', 'completed', 50),
(101, '2026-09-22T16:00:00', '2026-09-22T18:00:00', 'completed', 70);

-- Space 102

INSERT INTO tickets
(slot_id, entry_time, exit_time, status, fee)
VALUES
(102, '2026-09-22T08:00:00', '2026-09-22T12:00:00', 'completed', 70),
(102, '2026-09-22T13:00:00', '2026-09-22T15:00:00', 'completed', 50);

-- Space 103

INSERT INTO tickets
(slot_id, entry_time, exit_time, status, fee)
VALUES
(103, '2026-09-22T08:00:00', '2026-09-22T14:00:00', 'completed', 110),
(103, '2026-09-22T15:00:00', '2026-09-22T18:00:00', 'completed', 50);

-- Space 104

INSERT INTO tickets
(slot_id, entry_time, exit_time, status, fee)
VALUES
(104, '2026-09-22T09:00:00', '2026-09-22T17:00:00', 'completed', 150),
(104, '2026-09-22T18:00:00', '2026-09-22T20:00:00', 'completed', 50);

-- Space 105

INSERT INTO tickets
(slot_id, entry_time, exit_time, status, fee)
VALUES
(105, '2026-09-22T09:00:00', '2026-09-22T18:00:00', 'completed', 170),
(105, '2026-09-22T19:00:00', '2026-09-22T21:00:00', 'completed', 70);

-- Space 106

INSERT INTO tickets
(slot_id, entry_time, exit_time, status, fee)
VALUES
(106, '2026-09-22T07:30:00', '2026-09-22T08:30:00', 'completed', 50),
(106, '2026-09-22T09:00:00', '2026-09-22T11:00:00', 'completed', 50),
(106, '2026-09-22T12:00:00', '2026-09-22T14:00:00', 'completed', 50),
(106, '2026-09-22T15:00:00', '2026-09-22T18:00:00', 'completed', 50);

-- Space 107

INSERT INTO tickets
(slot_id, entry_time, exit_time, status, fee)
VALUES
(107, '2026-09-22T08:00:00', '2026-09-22T09:30:00', 'completed', 50),
(107, '2026-09-22T10:00:00', '2026-09-22T12:30:00', 'completed', 50),
(107, '2026-09-22T13:00:00', '2026-09-22T16:00:00', 'completed', 50);

-- Space 108

INSERT INTO tickets
(slot_id, entry_time, exit_time, status, fee)
VALUES
(108, '2026-09-22T08:00:00', '2026-09-22T16:00:00', 'completed', 150),
(108, '2026-09-22T17:00:00', '2026-09-22T20:00:00', 'completed', 50);

-- Space 109

INSERT INTO tickets
(slot_id, entry_time, exit_time, status, fee)
VALUES
(109, '2026-09-22T07:00:00', '2026-09-22T09:00:00', 'completed', 50),
(109, '2026-09-22T09:30:00', '2026-09-22T13:30:00', 'completed', 70),
(109, '2026-09-22T14:00:00', '2026-09-22T18:00:00', 'completed', 70);

-- Space 110

INSERT INTO tickets
(slot_id, entry_time, exit_time, status, fee)
VALUES
(110, '2026-09-22T08:00:00', '2026-09-22T10:00:00', 'completed', 50),
(110, '2026-09-22T11:00:00', '2026-09-22T14:00:00', 'completed', 50),
(110, '2026-09-22T15:00:00', '2026-09-22T19:00:00', 'completed', 70);

-- Space 111

INSERT INTO tickets
(slot_id, entry_time, exit_time, status, fee)
VALUES
(111, '2026-09-22T08:30:00', '2026-09-22T17:30:00', 'completed', 170);

-- Space 112

INSERT INTO tickets
(slot_id, entry_time, exit_time, status, fee)
VALUES
(112, '2026-09-22T09:00:00', '2026-09-22T12:00:00', 'completed', 50),
(112, '2026-09-22T13:00:00', '2026-09-22T16:00:00', 'completed', 50),
(112, '2026-09-22T17:00:00', '2026-09-22T21:00:00', 'completed', 70);

-- Space 113

INSERT INTO tickets
(slot_id, entry_time, exit_time, status, fee)
VALUES
(113, '2026-09-22T08:00:00', '2026-09-22T09:00:00', 'completed', 50),
(113, '2026-09-22T10:00:00', '2026-09-22T11:30:00', 'completed', 50),
(113, '2026-09-22T12:00:00', '2026-09-22T14:00:00', 'completed', 50),
(113, '2026-09-22T15:00:00', '2026-09-22T17:00:00', 'completed', 50),
(113, '2026-09-22T18:00:00', '2026-09-22T20:00:00', 'completed', 50);

-- Space 114

INSERT INTO tickets
(slot_id, entry_time, exit_time, status, fee)
VALUES
(114, '2026-09-22T07:00:00', '2026-09-22T15:00:00', 'completed', 150),
(114, '2026-09-22T16:00:00', '2026-09-22T20:00:00', 'completed', 70);

-- Space 115

INSERT INTO tickets
(slot_id, entry_time, exit_time, status, fee)
VALUES
(115, '2026-09-22T08:00:00', '2026-09-22T13:00:00', 'completed', 90),
(115, '2026-09-22T14:00:00', '2026-09-22T17:00:00', 'completed', 50);

-- Space 116

INSERT INTO tickets
(slot_id, entry_time, exit_time, status, fee)
VALUES
(116, '2026-09-22T09:00:00', '2026-09-22T10:00:00', 'completed', 50),
(116, '2026-09-22T11:00:00', '2026-09-22T15:00:00', 'completed', 70),
(116, '2026-09-22T16:00:00', '2026-09-22T19:00:00', 'completed', 50);

-- Space 117

INSERT INTO tickets
(slot_id, entry_time, exit_time, status, fee)
VALUES
(117, '2026-09-22T08:00:00', '2026-09-22T18:00:00', 'completed', 190);

-- Space 118

INSERT INTO tickets
(slot_id, entry_time, exit_time, status, fee)
VALUES
(118, '2026-09-22T08:00:00', '2026-09-22T10:00:00', 'completed', 50),
(118, '2026-09-22T11:00:00', '2026-09-22T13:00:00', 'completed', 50),
(118, '2026-09-22T14:00:00', '2026-09-22T17:00:00', 'completed', 50),
(118, '2026-09-22T18:00:00', '2026-09-22T21:00:00', 'completed', 50);

-- Space 119

INSERT INTO tickets
(slot_id, entry_time, exit_time, status, fee)
VALUES
(119, '2026-09-22T09:00:00', '2026-09-22T16:00:00', 'completed', 130),
(119, '2026-09-22T17:00:00', '2026-09-22T20:00:00', 'completed', 50);

-- Space 120

INSERT INTO tickets
(slot_id, entry_time, exit_time, status, fee)
VALUES
(120, '2026-09-22T07:30:00', '2026-09-22T08:30:00', 'completed', 50),
(120, '2026-09-22T09:00:00', '2026-09-22T10:30:00', 'completed', 50),
(120, '2026-09-22T11:00:00', '2026-09-22T13:00:00', 'completed', 50),
(120, '2026-09-22T14:00:00', '2026-09-22T16:00:00', 'completed', 50),
(120, '2026-09-22T17:00:00', '2026-09-22T19:00:00', 'completed', 50),
(120, '2026-09-22T19:30:00', '2026-09-22T21:00:00', 'completed', 50);

-- Space 121

INSERT INTO tickets
(slot_id, entry_time, exit_time, status, fee)
VALUES
(121, '2026-09-22T08:00:00', '2026-09-22T12:00:00', 'completed', 70),
(121, '2026-09-22T13:00:00', '2026-09-22T18:00:00', 'completed', 90);

-- Space 122

INSERT INTO tickets
(slot_id, entry_time, exit_time, status, fee)
VALUES
(122, '2026-09-22T08:00:00', '2026-09-22T09:00:00', 'completed', 50),
(122, '2026-09-22T10:00:00', '2026-09-22T12:00:00', 'completed', 50),
(122, '2026-09-22T13:00:00', '2026-09-22T15:00:00', 'completed', 50),
(122, '2026-09-22T16:00:00', '2026-09-22T18:00:00', 'completed', 50);

-- Space 123

INSERT INTO tickets
(slot_id, entry_time, exit_time, status, fee)
VALUES
(123, '2026-09-22T09:00:00', '2026-09-22T17:00:00', 'completed', 150);

-- Space 124

INSERT INTO tickets
(slot_id, entry_time, exit_time, status, fee)
VALUES
(124, '2026-09-22T08:00:00', '2026-09-22T11:00:00', 'completed', 50),
(124, '2026-09-22T12:00:00', '2026-09-22T15:00:00', 'completed', 50),
(124, '2026-09-22T16:00:00', '2026-09-22T19:00:00', 'completed', 50);

-- Space 125

INSERT INTO tickets
(slot_id, entry_time, exit_time, status, fee)
VALUES
(125, '2026-09-22T07:00:00', '2026-09-22T12:00:00', 'completed', 90),
(125, '2026-09-22T13:00:00', '2026-09-22T18:00:00', 'completed', 90);

-- Space 126

INSERT INTO tickets
(slot_id, entry_time, exit_time, status, fee)
VALUES
(126, '2026-09-22T08:00:00', '2026-09-22T09:30:00', 'completed', 50),
(126, '2026-09-22T10:00:00', '2026-09-22T12:00:00', 'completed', 50),
(126, '2026-09-22T13:00:00', '2026-09-22T16:00:00', 'completed', 50),
(126, '2026-09-22T17:00:00', '2026-09-22T20:00:00', 'completed', 50);

-- Space 127

INSERT INTO tickets
(slot_id, entry_time, exit_time, status, fee)
VALUES
(127, '2026-09-22T08:00:00', '2026-09-22T18:00:00', 'completed', 190);

-- Space 128

INSERT INTO tickets
(slot_id, entry_time, exit_time, status, fee)
VALUES
(128, '2026-09-22T09:00:00', '2026-09-22T11:00:00', 'completed', 50),
(128, '2026-09-22T12:00:00', '2026-09-22T15:00:00', 'completed', 50),
(128, '2026-09-22T16:00:00', '2026-09-22T19:00:00', 'completed', 50);

-- Space 129

INSERT INTO tickets
(slot_id, entry_time, exit_time, status, fee)
VALUES
(129, '2026-09-22T08:00:00', '2026-09-22T10:00:00', 'completed', 50),
(129, '2026-09-22T11:00:00', '2026-09-22T14:00:00', 'completed', 50),
(129, '2026-09-22T15:00:00', '2026-09-22T18:00:00', 'completed', 50),
(129, '2026-09-22T19:00:00', '2026-09-22T21:00:00', 'completed', 50);