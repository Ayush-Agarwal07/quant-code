"""Explicitly unimplemented broker boundary."""

from __future__ import annotations


class BrokerAdapterStub:
    """Prevent accidental use as a real broker integration."""

    def submit_order(self, order: object) -> None:
        del order
        raise NotImplementedError(
            "Broker integration is not implemented in this research prototype."
        )

    def cancel_order(self, order_id: str) -> None:
        del order_id
        raise NotImplementedError(
            "Broker integration is not implemented in this research prototype."
        )

    def get_positions(self) -> list[object]:
        raise NotImplementedError(
            "Broker integration is not implemented in this research prototype."
        )
