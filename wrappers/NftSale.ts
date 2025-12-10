import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';

export type NftSaleConfig = {
    isComplete: boolean;
    createdAt: number;
    marketplaceAddress: Address;
    nftAddress: Address;
    nftOwnerAddress: Address;
    fullPrice: bigint;
    marketplaceFeeAddress: Address;
    marketplaceFee: bigint;
    royaltyAddress: Address;
    royaltyAmount: bigint;
};

export function nftSaleConfigToCell(config: NftSaleConfig): Cell {
    return beginCell()
        .storeUint(config.isComplete ? 1 : 0, 1)
        .storeUint(config.createdAt, 32)
        .storeAddress(config.marketplaceAddress)
        .storeAddress(config.nftAddress)
        .storeAddress(config.nftOwnerAddress)
        .storeCoins(config.fullPrice)
        .storeRef(
            beginCell()
                .storeAddress(config.marketplaceFeeAddress)
                .storeCoins(config.marketplaceFee)
                .storeAddress(config.royaltyAddress)
                .storeCoins(config.royaltyAmount)
                .endCell()
        )
        .endCell();
}

export class NftSale implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new NftSale(address);
    }

    static createFromConfig(config: NftSaleConfig, code: Cell, workchain = 0) {
        const data = nftSaleConfigToCell(config);
        const init = { code, data };
        return new NftSale(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendCancel(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(1, 32).endCell(),
        });
    }

    async getSaleData(provider: ContractProvider) {
        const result = await provider.get('get_sale_data', []);
        result.stack.readNumber(); // magic
        return {
            isComplete: result.stack.readBoolean(),
            createdAt: result.stack.readNumber(),
            marketplaceAddress: result.stack.readAddress(),
            nftAddress: result.stack.readAddress(),
            nftOwnerAddress: result.stack.readAddress(),
            fullPrice: result.stack.readBigNumber(),
            // ... ignoring fees for brevity
        };
    }
}

