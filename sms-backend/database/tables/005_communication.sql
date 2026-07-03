-- Communication tables
CREATE TABLE announcements (
    id           SERIAL PRIMARY KEY,
    title        VARCHAR(200) NOT NULL,
    body         TEXT,
    target_roles TEXT[],      -- ['teacher','student'] etc.
    created_by   INT REFERENCES users(id),
    created_at   TIMESTAMP DEFAULT NOW()
);

CREATE TABLE messages (
    id          SERIAL PRIMARY KEY,
    sender_id   INT REFERENCES users(id),
    receiver_id INT REFERENCES users(id),
    subject     VARCHAR(200),
    body        TEXT,
    is_read     BOOLEAN DEFAULT FALSE,
    sent_at     TIMESTAMP DEFAULT NOW()
);
