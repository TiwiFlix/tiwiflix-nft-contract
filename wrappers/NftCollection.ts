import {
    Address,
    beginCell,
    Cell,
    Contract,
    contractAddress,
    ContractProvider,
    Dictionary,
    DictionaryValue,
    Sender,
    SendMode,
    toNano,
} from '@ton/core';
import { decodeOffChainContent, encodeOffChainContent } from './metadata';

export const Opcodes = {
    getRoyaltyParams: 0x693d3950,
    mint: 1,
    batchMint: 2,
    changeOwner: 3,
    changeContent: 4, // New opcode for updating mint price
    changeMintPrice: 5, // New opcode for updating mint price
    changeNftItemAmount: 6,
    changeRoyaltyParams: 7,
    changeMaxSupply: 8,
    emergencyWithdraw: 10,
};

export type RoyaltyParams = {
    factor: number;
    base: number;
    address: Address;
};

export type NftCollectionConfig = {
    ownerAddress: Address;
    nextItemIndex: number;
    collectionContentUrl: string;
    commonContentUrl: string;
    nftItemCode: Cell;
    royaltyParams: RoyaltyParams;
    mintPrice: number; // Add mint price
    isVerified?: boolean;
    nftItemAmount?: number; // Optional default 0.05 TON
    maxSupply?: bigint; // Optional default unlimited (2^64-1)
};

export function nftCollectionConfigToCell(config: NftCollectionConfig): Cell {
    const content = beginCell()
        .storeRef(encodeOffChainContent(config.collectionContentUrl))
        .storeRef(beginCell().storeBuffer(Buffer.from(config.commonContentUrl)).endCell())
        .endCell();
    const royaltyParams = beginCell()
        .storeUint(config.royaltyParams.factor, 16)
        .storeUint(config.royaltyParams.base, 16)
        .storeAddress(config.royaltyParams.address)
        .endCell();

    return beginCell()
        .storeAddress(config.ownerAddress)
        .storeUint(config.nextItemIndex, 64)
        .storeRef(content)
        .storeRef(config.nftItemCode)
        .storeRef(royaltyParams)
        .storeUint(config.mintPrice, 64) // Store mint price
        .storeUint(config.isVerified ? 1 : 0, 1) // Store verified status
        .storeUint(config.nftItemAmount ?? 50000000, 64) // Store nft item amount
        .storeUint(config.maxSupply ?? 18446744073709551615n, 64) // Max supply
        .endCell();
}

export class NftCollection implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell },
    ) {}

    static createFromAddress(address: Address) {
        return new NftCollection(address);
    }

    static createFromConfig(config: NftCollectionConfig, code: Cell, workchain = 0) {
        const data = nftCollectionConfigToCell(config);
        const init = { code, data };
        return new NftCollection(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendGetRoyaltyParams(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            queryId: number;
        },
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().storeUint(Opcodes.getRoyaltyParams, 32).storeUint(opts.queryId, 64).endCell(),
        });
    }

    async sendMint(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            queryId: number;
            coinsForStorage: bigint;
            ownerAddress: Address;
            content: string;
            index: number;
        },
    ) {
        const nftItemContent = beginCell();
        nftItemContent.storeAddress(opts.ownerAddress);

        const uriContent = beginCell();
        uriContent.storeBuffer(Buffer.from(opts.content));
        nftItemContent.storeRef(uriContent.endCell());

        await provider.internal(via, {
            value: opts.value, // Ensure this includes the mint price
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.mint, 32)
                .storeUint(opts.queryId, 64)
                .storeUint(opts.index, 64)
                .storeCoins(opts.coinsForStorage)
                .storeRef(nftItemContent)
                .endCell(),
        });
    }

    async sendBatchMint(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            queryId: number;
            addresses: Address[];
            nextItemIndex: number;
            nftItemAmount?: bigint;
        },
    ) {
        const mintDict = Dictionary.empty(Dictionary.Keys.Uint(64), this.createMessageValue()); // Key: Uint(64)

        for (let i = 0; i < opts.addresses.length; i++) {
            const nftContent = beginCell(); // Create your NFT content cell
            nftContent.storeAddress(opts.addresses[i]); // Store the owner's address

            const uriContent = beginCell();
            uriContent.storeBuffer(Buffer.from('/nft.json'));
            nftContent.storeRef(uriContent.endCell());
            mintDict.set(opts.nextItemIndex + i, {
                value: opts.nftItemAmount ?? toNano(0.06), // Enough for storage (0.05) + gas
                content: nftContent.endCell(),
            }); // Use sequential BigInt keys starting from 1
        }
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body:  beginCell()
            .storeUint(Opcodes.batchMint, 32) // Opcode for send
            .storeUint(opts.queryId ?? 0, 64) // Optional query ID (default 0)
            // .storeCoins(opts.value) // Value for the transaction
            .storeDict(mintDict, Dictionary.Keys.Uint(64), {
                serialize: (src: { value: bigint; content: Cell }, builder) => {
                    builder.storeCoins(src.value).storeRef(src.content);
                },
                parse: (src) => {
                    return { value: src.loadCoins(), content: src.loadRef() };
                },
            }) // Store the transfer dictionary
            .endCell(),
        });
    }

    createMessageValue(): DictionaryValue<any> {
        return {
            serialize: (src, builder) => {
                builder.storeCoins(src.value).storeRef(src.content);
            },
            parse: (src) => {
                return { value: src.loadCoins(), content: src.loadRef() };
            },
        };
    }

    async sendChangeMintPrice(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            queryId: number;
            newMintPrice: number;
        },
    ) {
        return await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.changeMintPrice, 32)
                .storeUint(opts.queryId, 64)
                .storeUint(opts.newMintPrice, 64) // Update mint price
                .endCell(),
        });
    }

    async sendChangeNftItemAmount(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            queryId: number;
            newNftItemAmount: number;
        },
    ) {
        return await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.changeNftItemAmount, 32)
                .storeUint(opts.queryId, 64)
                .storeUint(opts.newNftItemAmount, 64) // Update mint price
                .endCell(),
        });
    }

    async sendChangeOwner(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            queryId: number;
            newOwnerAddress: Address;
        },
    ) {
        return await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.changeOwner, 32)
                .storeUint(opts.queryId, 64)
                .storeAddress(opts.newOwnerAddress) // Update mint price
                .endCell(),
        });
    }

    async sendChangeContent(provider: ContractProvider, via: Sender, value: bigint, config: NftCollectionConfig) {
        const content = beginCell()
            .storeRef(encodeOffChainContent(config.collectionContentUrl))
            .storeRef(beginCell().storeBuffer(Buffer.from(config.commonContentUrl)).endCell())
            .endCell();
        const royaltyParams = beginCell()
            .storeUint(config.royaltyParams.factor, 16)
            .storeUint(config.royaltyParams.base, 16)
            .storeAddress(config.royaltyParams.address)
            .endCell();

        const body = beginCell()
            .storeUint(Opcodes.changeContent, 32)
            .storeUint(Date.now(), 64) // queryId
            .storeRef(content)
            .storeRef(royaltyParams)
            .endCell();

        return await provider.internal(via, {
            value: value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: body,
        });
    }

    async sendChangeRoyaltyParams(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            queryId: number;
            newRoyaltyParams: RoyaltyParams;
        },
    ) {
        const royaltyParams = beginCell()
            .storeUint(opts.newRoyaltyParams.factor, 16)
            .storeUint(opts.newRoyaltyParams.base, 16)
            .storeAddress(opts.newRoyaltyParams.address)
            .endCell();

        return await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.changeRoyaltyParams, 32)
                .storeUint(opts.queryId, 64)
                .storeRef(royaltyParams)
                .endCell(),
        });
    }

    async sendChangeMaxSupply(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            queryId: number;
            newMaxSupply: bigint;
        },
    ) {
        return await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.changeMaxSupply, 32)
                .storeUint(opts.queryId, 64)
                .storeUint(opts.newMaxSupply, 64)
                .endCell(),
        });
    }

    async sendEmergencyWithdraw(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            queryId: number;
        },
    ) {
        return await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.emergencyWithdraw, 32)
                .storeUint(opts.queryId, 64)
                .endCell(),
        });
    }

    async getCollectionBalance(provider: ContractProvider): Promise<bigint> {
        const state = await provider.getState();
        return state.balance;
    }

    async getMintingPrice(provider: ContractProvider): Promise<bigint> {
        const { stack } = await provider.get('get_minting_price', []);
        return stack.readBigNumber(); // Return mint price
    }

    async getIsVerified(provider: ContractProvider): Promise<boolean> {
        const { stack } = await provider.get('is_verified', []);
        return stack.readBoolean();
    }

    async getNftItemAmount(provider: ContractProvider): Promise<bigint> {
        const { stack } = await provider.get('get_nft_item_amount', []);
        return stack.readBigNumber();
    }

    async getMaxSupply(provider: ContractProvider): Promise<bigint> {
        const { stack } = await provider.get('get_max_supply', []);
        return stack.readBigNumber();
    }

    async getCollectionData(provider: ContractProvider): Promise<{
        nextItemIndex: number;
        collectionContentUrl: string;
        ownerAddress: Address;
    }> {
        const { stack } = await provider.get('get_collection_data', []);

        return {
            nextItemIndex: stack.readNumber(),
            collectionContentUrl: decodeOffChainContent(stack.readCell()),
            ownerAddress: stack.readAddress(),
        };
    }

    async getNftAddressByIndex(provider: ContractProvider, index: bigint): Promise<Address> {
        const { stack } = await provider.get('get_nft_address_by_index', [
            {
                type: 'int',
                value: index,
            },
        ]);

        return stack.readAddress();
    }

    async getRoyaltyParams(provider: ContractProvider): Promise<RoyaltyParams> {
        const { stack } = await provider.get('royalty_params', []);

        return {
            factor: stack.readNumber(),
            base: stack.readNumber(),
            address: stack.readAddress(),
        };
    }

    async getNftContent(provider: ContractProvider, index: bigint, individualNftContent: Cell): Promise<string> {
        const { stack } = await provider.get('get_nft_content', [
            {
                type: 'int',
                value: index,
            },
            {
                type: 'cell',
                cell: individualNftContent,
            },
        ]);

        return decodeOffChainContent(stack.readCell());
    }
}
