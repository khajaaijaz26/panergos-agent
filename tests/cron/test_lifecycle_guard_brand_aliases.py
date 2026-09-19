from unittest.mock import patch

import pytest

from cron.lifecycle_guard import (
    GatewayLifecycleBlocked,
    check_gateway_lifecycle,
    contains_gateway_lifecycle_command,
)


def test_gateway_lifecycle_guard_accepts_canonical_launcher():
    assert contains_gateway_lifecycle_command("panergos gateway restart")


def test_profile_gateway_lifecycle_guard_accepts_canonical_launcher():
    with patch("cron.lifecycle_guard._current_profile_name", return_value="work"):
        assert contains_gateway_lifecycle_command("panergos -p work gateway stop")
        assert not contains_gateway_lifecycle_command("panergos -p sibling gateway stop")


def test_gateway_lifecycle_guidance_uses_canonical_launcher():
    with pytest.raises(GatewayLifecycleBlocked, match=r"panergos gateway restart"):
        check_gateway_lifecycle("panergos gateway restart")
