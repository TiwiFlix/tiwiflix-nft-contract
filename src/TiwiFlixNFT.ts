import { Address, beginCell, toNano, Dictionary, Cell, TonClient, TupleBuilder } from '@ton/core';
import { SendTransactionRequest } from '@tonconnect/ui-react';

// --- Constants & Opcodes ---
export const Opcodes = {
    mint: 1,
    batchMint: 2,
    changeOwner: 3,
    changeContent: 4,
    changeMintPrice: 5,
    changeNftItemAmount: 6,
    changeRoyalties: 7,
    changeMaxSupply: 8,
    emergencyWithdraw: 10,
    transfer: 0x5fcc3d14,
};

// --- Helper Types ---
export type RoyaltyParams = {
    factor: number;
    base: number;
    address: string;
};

// --- Main Integration Class ---
export class TiwiFlixNFT {
    
    /**
     * Mint a single NFT
     */
    static mint(
        collectionAddress: string, 
        userAddress: string, 
        itemIndex: number, 
        mintPrice: string = '0.1'
    ): SendTransactionRequest {
        const body = beginCell()
            .storeUint(Opcodes.mint, 32)
            .storeUint(0, 64) // query_id
            .storeUint(itemIndex, 64)
            .storeCoins(toNano('0.05')) // amount for item storage
            .storeRef(
                beginCell()
                    .storeAddress(Address.parse(userAddress)) // owner
                    .storeRef(beginCell().storeBuffer(Buffer.from('/nft.json')).endCell()) // content
                    .endCell()
            )
            .endCell();

        return {
            validUntil: Math.floor(Date.now() / 1000) + 600,
            messages: [
                {
                    address: collectionAddress,
                    amount: toNano(Number(mintPrice) + 0.05).toString(), // Price + Gas
                    payload: body.toBoc().toString('base64'),
                },
            ],
        };
    }

    /**
     * Batch Mint NFTs (Safe Limit: ~80 items)
     */
    static batchMint(
        collectionAddress: string, 
        recipientAddresses: string[], 
        startIndex: number
    ): SendTransactionRequest {
        const mintDict = Dictionary.empty(Dictionary.Keys.Uint(64), Dictionary.Values.Cell());

        for (let i = 0; i < recipientAddresses.length; i++) {
            const itemContent = beginCell()
                .storeAddress(Address.parse(recipientAddresses[i]))
                .storeRef(beginCell().storeBuffer(Buffer.from('/nft.json')).endCell())
                .endCell();
            
            const cellValue = beginCell()
                .storeCoins(toNano('0.05')) // Amount for item
                .storeRef(itemContent)
                .endCell();

            mintDict.set(startIndex + i, cellValue);
        }

        const body = beginCell()
            .storeUint(Opcodes.batchMint, 32)
            .storeUint(0, 64)
            .storeDict(mintDict)
            .endCell();

        return {
            validUntil: Math.floor(Date.now() / 1000) + 600,
            messages: [
                {
                    address: collectionAddress,
                    amount: toNano(0.08 * recipientAddresses.length).toString(), // approx gas
                    payload: body.toBoc().toString('base64'),
                },
            ],
        };
    }

    /**
     * Withdraw Collection Funds (Owner Only)
     */
    static withdrawFunds(collectionAddress: string): SendTransactionRequest {
        const body = beginCell()
            .storeUint(Opcodes.emergencyWithdraw, 32)
            .storeUint(0, 64)
            .endCell();

        return {
            validUntil: Math.floor(Date.now() / 1000) + 600,
            messages: [
                {
                    address: collectionAddress,
                    amount: toNano('0.05').toString(),
                    payload: body.toBoc().toString('base64'),
                },
            ],
        };
    }

    /**
     * Update Royalties (Owner Only)
     */
    static updateRoyalties(
        collectionAddress: string, 
        factor: number, 
        base: number, 
        royaltyAddress: string
    ): SendTransactionRequest {
        const royaltyCell = beginCell()
            .storeUint(factor, 16)
            .storeUint(base, 16)
            .storeAddress(Address.parse(royaltyAddress))
            .endCell();

        const body = beginCell()
            .storeUint(Opcodes.changeRoyalties, 32)
            .storeUint(0, 64)
            .storeRef(royaltyCell)
            .endCell();

        return {
            validUntil: Math.floor(Date.now() / 1000) + 600,
            messages: [
                {
                    address: collectionAddress,
                    amount: toNano('0.05').toString(),
                    payload: body.toBoc().toString('base64'),
                },
            ],
        };
    }

    /**
     * Transfer NFT (Standard TEP-62)
     */
    static transferNft(
        nftAddress: string, 
        newOwner: string, 
        responseAddress: string, 
        forwardAmount: string = '0.01'
    ): SendTransactionRequest {
        const body = beginCell()
            .storeUint(Opcodes.transfer, 32)
            .storeUint(0, 64)
            .storeAddress(Address.parse(newOwner))
            .storeAddress(Address.parse(responseAddress))
            .storeUint(0, 1) // null custom_payload
            .storeCoins(toNano(forwardAmount))
            .storeUint(0, 1) // null forward_payload
            .endCell();

        return {
            validUntil: Math.floor(Date.now() / 1000) + 600,
            messages: [
                {
                    address: nftAddress,
                    amount: toNano('0.1').toString(), // 0.1 TON gas usually sufficient
                    payload: body.toBoc().toString('base64'),
                },
            ],
        };
    }

    /**
     * Deploy Sale Contract & List NFT
     * (Requires 2 steps logically, but in React we usually do them sequentially or user manually sends 2 txs.
     * This function generates the DEPLOY payload for the sale contract.
     * You still need to transfer the NFT to this contract address afterwards.)
     */
    static deploySaleContract(
        saleContractCode: Cell, // You need to import the compiled code in React
        nftAddress: string,
        price: string,
        marketplaceAddress: string,
        ownerAddress: string,
        royaltyAddress: string,
        royaltyAmount: string
    ) {
        // Construct Initial Data
        const data = beginCell()
            .storeUint(0, 1) // is_complete
            .storeUint(Math.floor(Date.now() / 1000), 32) // created_at
            .storeAddress(Address.parse(marketplaceAddress))
            .storeAddress(Address.parse(nftAddress))
            .storeAddress(Address.parse(ownerAddress))
            .storeCoins(toNano(price))
            .storeRef(
                beginCell()
                    .storeAddress(Address.parse(marketplaceAddress)) // fees addr
                    .storeCoins(0) // fees
                    .storeAddress(Address.parse(royaltyAddress))
                    .storeCoins(toNano(royaltyAmount)) // royalty amount
                    .endCell()
            )
            .endCell();

        const stateInit = beginCell()
            .storeUint(0, 2)
            .storeDict(saleCode) // Set the code
            .storeDict(data)     // Set the data
            .storeUint(0, 1)
            .endCell();

        const saleAddress = new Address(0, stateInit.hash());

        // This returns the request to DEPLOY.
        // After this succeeds, call transferNft() to `saleAddress`
        return {
            request: {
                validUntil: Math.floor(Date.now() / 1000) + 600,
                messages: [
                    {
                        address: saleAddress.toString(),
                        amount: toNano('0.05').toString(),
                        stateInit: stateInit.toBoc().toString('base64'),
                        payload: '', // Empty body for deploy
                    },
                ],
            },
            address: saleAddress.toString()
        };
    }

    /**
     * Buy NFT (Simple Transfer of TON to Sale Contract)
     */
    /**
     * Get the current Mint Price from the Collection
     */
    static async getMintPrice(
        client: any, // Accepts generic client interface (TonClient or similar)
        collectionAddress: string
    ): Promise<bigint> {
        // We assume client has runMethod. 
        // If using @ton/ton TonClient:
        const result = await client.runMethod(
            Address.parse(collectionAddress), 
            'get_minting_price'
        );
        return result.stack.readBigNumber();
    }
}

