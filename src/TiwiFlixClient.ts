import { Address, beginCell, toNano, Dictionary, Cell, TonClient } from '@ton/core';

// Define the shape of the transaction request expected by TonConnect
// This avoids importing '@tonconnect/ui-react' directly
export type TonConnectTransaction = {
    validUntil: number;
    messages: {
        address: string;
        amount: string;
        payload?: string; // base64
        stateInit?: string; // base64
    }[];
};

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

export class TiwiFlixClient {
    
    /**
     * Get Mint Price (Read from Chain)
     */
    static async getMintPrice(client: TonClient, collectionAddress: string): Promise<bigint> {
        const result = await client.runMethod(
            Address.parse(collectionAddress), 
            'get_minting_price'
        );
        return result.stack.readBigNumber();
    }

    /**
     * Estimate Gas/Fee for Minting (Experimental)
     * Note: Exact estimation requires simulating the user's wallet transfer. 
     * This method estimates the execution cost on the Collection contract itself.
     */
    static async estimateMintFee(
        client: TonClient,
        collectionAddress: string,
        userAddress: string,
        itemIndex: number,
        amount: bigint
    ): Promise<bigint> {
        const body = beginCell()
            .storeUint(Opcodes.mint, 32)
            .storeUint(0, 64)
            .storeUint(itemIndex, 64)
            .storeCoins(toNano('0.05'))
            .storeRef(
                beginCell()
                    .storeAddress(Address.parse(userAddress))
                    .storeRef(beginCell().storeBuffer(Buffer.from('/nft.json')).endCell())
                    .endCell()
            )
            .endCell();

        // Run the get method or emulate? 
        // Emulation of 'recv_internal' via API is complex. 
        // Standard practice: Just rely on the known ~0.08 TON cost.
        // But if you want to use the API:
        // const result = await client.estimateFee(...) 
        // This usually requires the message to be fully signed.
        
        // Return a safe constant for now, or implement complex emulation if critical.
        return toNano('0.08'); 
    }

    /**
     * Generate "Mint" Transaction Request (for TonConnect or any wallet)
     */
    static createMintRequest(
        collectionAddress: string, 
        userAddress: string, 
        itemIndex: number, 
        mintPrice: string = '0.1'
    ): TonConnectTransaction {
        const body = beginCell()
            .storeUint(Opcodes.mint, 32)
            .storeUint(0, 64)
            .storeUint(itemIndex, 64)
            .storeCoins(toNano('0.05'))
            .storeRef(
                beginCell()
                    .storeAddress(Address.parse(userAddress))
                    .storeRef(beginCell().storeBuffer(Buffer.from('/nft.json')).endCell())
                    .endCell()
            )
            .endCell();

        return {
            validUntil: Math.floor(Date.now() / 1000) + 600,
            messages: [
                {
                    address: collectionAddress,
                    amount: toNano(Number(mintPrice) + 0.05).toString(),
                    payload: body.toBoc().toString('base64'),
                },
            ],
        };
    }
}

