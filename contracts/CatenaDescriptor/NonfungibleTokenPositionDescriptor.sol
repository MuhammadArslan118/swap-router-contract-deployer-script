// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity =0.7.6;
pragma abicoder v2;

import './ICatenaswapPool.sol';
import './SafeERC20Namer.sol';

import './ChainId.sol';
import './INonfungiblePositionManager.sol';
import './INonfungibleTokenPositionDescriptor.sol';
import './IERC20Metadata.sol';
import './PoolAddress.sol';
import './NFTDescriptor.sol';
import './TokenRatioSortOrder.sol';

/// @title Describes NFT token positions
/// @notice Produces a string containing the data URI for a JSON metadata string
contract NonfungibleTokenPositionDescriptor is INonfungibleTokenPositionDescriptor {
    address private constant wusdp= 0x74868b4EB42Dd5F8cc6c2d321f9bCE33F5F97D6B;
  
 
    address public immutable WCTA;


    constructor(address _WCTA) {
        WCTA = _WCTA;
    }


    /// @inheritdoc INonfungibleTokenPositionDescriptor
    function tokenURI(INonfungiblePositionManager positionManager, uint256 tokenId)
        external
        view
        override
        returns (string memory)
    {
        (, , address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, , , , , ) =
            positionManager.positions(tokenId);

        ICatenaswapPool pool =
            ICatenaswapPool(
                PoolAddress.computeAddress(
                    positionManager.factory(),
                    PoolAddress.PoolKey({token0: token0, token1: token1, fee: fee})
                )
            );

        bool _flipRatio = flipRatio(token0, token1, ChainId.get());
        address quoteTokenAddress = !_flipRatio ? token1 : token0;
        address baseTokenAddress = !_flipRatio ? token0 : token1;
        (, int24 tick, , , , , ) = pool.slot0();

        return
              NFTDescriptor.constructTokenURI(
                NFTDescriptor.ConstructTokenURIParams({
                    tokenId: tokenId,
                    quoteTokenAddress: quoteTokenAddress,
                    baseTokenAddress: baseTokenAddress,
                    quoteTokenSymbol: SafeERC20Namer.tokenSymbol(quoteTokenAddress),
                    baseTokenSymbol:  SafeERC20Namer.tokenSymbol(baseTokenAddress),
                    quoteTokenDecimals: IERC20Metadata(quoteTokenAddress).decimals(),
                    baseTokenDecimals: IERC20Metadata(baseTokenAddress).decimals(),
                    flipRatio: _flipRatio,
                    tickLower: tickLower,
                    tickUpper: tickUpper,
                    tickCurrent: tick,
                    tickSpacing: pool.tickSpacing(),
                    fee: fee,
                    poolAddress: address(pool)
                })
            );
    }

    function flipRatio(
        address token0,
        address token1,
        uint256 chainId
    ) public view returns (bool) {
        return tokenRatioPriority(token0, chainId) > tokenRatioPriority(token1, chainId);
    }

    function tokenRatioPriority(address token, uint256 chainId) public view returns (int256) {
        if (token == WCTA) {
            return TokenRatioSortOrder.DENOMINATOR;
        }
        if (chainId ==14601) {
             if (token == wusdp) {
                return TokenRatioSortOrder.NUMERATOR_MORE; }
          
            else {
                return 0;
            }
        }
        return 0;
    }
}
