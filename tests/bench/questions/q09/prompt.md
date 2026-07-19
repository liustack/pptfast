# Checkout Outage Postmortem

You're the SRE lead writing the blameless postmortem record for last Tuesday's 47-minute checkout outage — circulated as a written document engineers read closely, never presented live.

Walk through what happened in order: detection took 6 minutes after the first alert fired, mitigation started at the 22-minute mark once the on-call engineer identified the connection pool exhaustion, and full recovery landed at 47 minutes once the fix rolled out. Root cause: a deploy that skipped the canary stage due to a CI queue backlog let a connection-leak regression go straight to full traffic. Customer impact: an estimated 3,200 failed checkout attempts and roughly $58K in lost revenue for the window.

Close with five concrete follow-up actions, each with a named owner and a due date — restoring the canary gate as a hard requirement, adding a connection-pool alert threshold, and so on.

Precise, source-of-record tone — this is what gets linked in the next incident review, not something skimmed once and forgotten.
