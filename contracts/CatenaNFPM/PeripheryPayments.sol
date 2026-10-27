// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.7.5;

import './IERC20.sol';

import './IPeripheryPayments.sol';
import './IWCTA.sol';

import './TransferHelper.sol';

import './PeripheryImmutableState.sol';

abstract contract PeripheryPayments is IPeripheryPayments, PeripheryImmutableState {
    receive() external payable {
        require(msg.sender == WCTA, 'Not WCTA');
    }

    /// @inheritdoc IPeripheryPayments
    function unwrapWCTA(uint256 amountMinimum, address recipient) public payable override {
        uint256 balanceWCTA = IWCTA(WCTA).balanceOf(address(this));
        require(balanceWCTA >= amountMinimum, 'Insufficient WCTA');

        if (balanceWCTA > 0) {
            IWCTA(WCTA).withdraw(balanceWCTA);
            TransferHelper.safeTransferCTA(recipient, balanceWCTA);
        }
    }

    /// @inheritdoc IPeripheryPayments
    function sweepToken(
        address token,
        uint256 amountMinimum,
        address recipient
    ) public payable override {
        uint256 balanceToken = IERC20(token).balanceOf(address(this));
        require(balanceToken >= amountMinimum, 'Insufficient token');

        if (balanceToken > 0) {
            TransferHelper.safeTransfer(token, recipient, balanceToken);
        }
    }

    /// @inheritdoc IPeripheryPayments
    function refundCTA() external payable override {
        if (address(this).balance > 0) TransferHelper.safeTransferCTA(msg.sender, address(this).balance);
    }

    /// @param token The token to pay
    /// @param payer The entity that must pay
    /// @param recipient The entity that will receive payment
    /// @param value The amount to pay
    function pay(
        address token,
        address payer,
        address recipient,
        uint256 value
    ) internal {
        if (token == WCTA && address(this).balance >= value) {
            // pay with WCTA
            IWCTA(WCTA).deposit{value: value}(); // wrap only what is needed to pay
            IWCTA(WCTA).transfer(recipient, value);
        } else if (payer == address(this)) {
            // pay with tokens already in the contract (for the exact input multihop case)
            TransferHelper.safeTransfer(token, recipient, value);
        } else {
            // pull payment
            TransferHelper.safeTransferFrom(token, payer, recipient, value);
        }
    }
}
