import { Address } from '@ton/core';
import { NftCollection } from '../wrappers/NftCollection';
import { NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider, args: string[]) {
    const ui = provider.ui();

    const collectionAddressStr = args.length > 0 ? args[0] : await ui.input('Collection address');
    const collectionAddress = Address.parse(collectionAddressStr);

    const nftCollection = provider.open(NftCollection.createFromAddress(collectionAddress));

    console.log(`Fetching royalties for collection ${collectionAddress}...`);

    try {
        const royaltyParams = await nftCollection.getRoyaltyParams();
        
        const percentage = (Number(royaltyParams.factor) / Number(royaltyParams.base)) * 100;
        
        console.log('\n--- Royalty Settings ---');
        console.log(`Percent: ${percentage}%`);
        console.log(`Address: ${royaltyParams.address.toString()}`);
        console.log(`(Factor: ${royaltyParams.factor}, Base: ${royaltyParams.base})`);
        
    } catch (e) {
        console.error('Error fetching royalties:', e);
    }
}

