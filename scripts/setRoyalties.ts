import { Address, toNano } from '@ton/core';
import { NftCollection } from '../wrappers/NftCollection';
import { NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider, args: string[]) {
    const ui = provider.ui();

    const collectionAddressStr = args.length > 0 ? args[0] : await ui.input('Collection address');
    const collectionAddress = Address.parse(collectionAddressStr);

    const nftCollection = provider.open(NftCollection.createFromAddress(collectionAddress));

    console.log(`Updating royalties for collection ${collectionAddress}...`);

    // Get current royalties to pre-fill address if needed
    let currentAddress = provider.sender().address; 
    try {
        const params = await nftCollection.getRoyaltyParams();
        currentAddress = params.address;
        console.log(`Current Royalty Address: ${currentAddress}`);
    } catch (e) {
        console.log('Could not fetch current params.');
    }

    const newPercentageStr = args.length > 1 ? args[1] : await ui.input('New Royalty Percentage (e.g. 50)');
    const newPercentage = parseFloat(newPercentageStr);

    const newAddressStr = args.length > 2 ? args[2] : await ui.input(`Royalty Recipient Address (default: ${currentAddress})`);
    const newAddress = newAddressStr ? Address.parse(newAddressStr) : currentAddress;

    if (!newAddress) throw new Error('Recipient address required');

    // Calculate Factor and Base
    // We use a base of 1000 for 1 decimal precision, or 100 for integer.
    // Let's use base 1000.
    const base = 1000;
    const factor = Math.floor(newPercentage * 10); // 50% * 10 = 500. 500/1000 = 0.5 = 50%

    await nftCollection.sendChangeRoyaltyParams(provider.sender(), {
        value: toNano('0.05'),
        queryId: Date.now(),
        newRoyaltyParams: {
            factor: factor,
            base: base,
            address: newAddress
        }
    });

    ui.write('Transaction sent to update royalties.');
}

