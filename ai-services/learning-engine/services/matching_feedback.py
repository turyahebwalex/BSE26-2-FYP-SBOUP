"""Hook fired after a progress update lands a `profileskills` upsert.

Today this is a no-op-by-default audit log: the matching-engine reads
`profileskills` from Mongo on every score request, so the feedback
loop closes automatically through the database — the next call to
`/api/match/score` reflects the new skill state with no out-of-band
notification needed.

The hook exists so a future cache-invalidation endpoint on the
matching-engine can be wired without touching learning-engine callers.
Do NOT POST to `/api/match/recommendations/refresh/{userId}` — that
endpoint does not exist on the matching-engine (verified against
ai-services/matching-engine/app/main.py).
"""
from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


async def notify_profile_skill_change(
    user_id: str,
    skill_name: str,
    *,
    upserted: bool,
) -> None:
    """Audit-log the profileskills change.

    SDD §3.2.5 progress-feedback loop: matching-engine sees the change
    on the worker's next score request, no explicit invalidation needed.
    """
    logger.info(
        "matching feedback: profileskills %s for user=%s skill=%r",
        "upserted" if upserted else "noop",
        user_id,
        skill_name,
        extra={"userId": user_id, "skill": skill_name, "upserted": upserted},
    )
