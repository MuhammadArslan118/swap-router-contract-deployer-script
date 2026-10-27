// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.7.5;

import './IERC20.sol';
import './LowGasSafeMath.sol';

import './PeripheryPayments.sol';
import './IPeripheryPaymentsWithFee.sol';

import './IWCTA.sol';
import './TransferHelper.sol';

abstract contract PeripheryPaymentsWithFee is PeripheryPayments, IPeripheryPaymentsWithFee {
    using LowGasSafeMath for uint256;

    /// @inheritdoc IPeripheryPaymentsWithFee
    function unwrapWCTAWithFee(
        uint256 amountMinimum,
        address recipient,
        uint256 feeBips,
        address feeRecipient
    ) public payable override {
        require(feeBips > 0 && feeBips <= 100);

        uint256 balanceWCTA = IWCTA(WCTA).balanceOf(address(this));
        require(balanceWCTA >= amountMinimum, 'Insufficient WCTA');

        if (balanceWCTA > 0) {
            IWCTA(WCTA).withdraw(balanceWCTA);
            uint256 feeAmount = balanceWCTA.mul(feeBips) / 10_000;
            if (feeAmount > 0) TransferHelper.safeTransferCTA(feeRecipient, feeAmount);
            TransferHelper.safeTransferCTA(recipient, balanceWCTA - feeAmount);
        }
    }

    /// @inheritdoc IPeripheryPaymentsWithFee
    function sweepTokenWithFee(
        address token,
        uint256 amountMinimum,
        address recipient,
        uint256 feeBips,
        address feeRecipient
    ) public payable override {
        require(feeBips > 0 && feeBips <= 100);

        uint256 balanceToken = IERC20(token).balanceOf(address(this));
        require(balanceToken >= amountMinimum, 'Insufficient token');

        if (balanceToken > 0) {
            uint256 feeAmount = balanceToken.mul(feeBips) / 10_000;
            if (feeAmount > 0) TransferHelper.safeTransfer(token, feeRecipient, feeAmount);
            TransferHelper.safeTransfer(token, recipient, balanceToken - feeAmount);
        }
    }
}
