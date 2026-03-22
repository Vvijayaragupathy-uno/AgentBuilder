def can_submit_session(*, is_active: bool, is_submitted: bool) -> bool:
    return bool(is_active) and not bool(is_submitted)


def can_join_demo_queue(*, is_active: bool, is_submitted: bool) -> bool:
    return bool(is_active) and bool(is_submitted)
