import { Address, fromNano, toNano } from '@ton/core';
import { NftCollection } from '../wrappers/NftCollection';
import { NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider, args: string[]) {
    const ui = provider.ui();

    const addressStr = args.length > 0 ? args[0] : await ui.input('Collection address');
    const address = Address.parse(addressStr);
    const nftCollection = provider.open(NftCollection.createFromAddress(address));

    const collectionData = await nftCollection.getCollectionData();
    const mintPrice = await nftCollection.getMintingPrice();

    console.log('---------------------------------------------------------');
    console.log('🌍 Testing External Address Minting');
    console.log('Collection Address:', address.toString());
    console.log('Mint Price:', fromNano(mintPrice), 'TON');
    console.log('---------------------------------------------------------');

    console.log('Please ensure you are connected with a wallet that is NOT the owner if you want to test "External" minting.');
    console.log('Current Connected Wallet:', provider.sender().address?.toString());
    console.log('Collection Owner:', collectionData.ownerAddress.toString());

    if (provider.sender().address?.equals(collectionData.ownerAddress)) {
        const proceed = await ui.choose('You are the OWNER. Do you want to proceed anyway (test self-mint)?', ['Yes', 'No'], (c) => c);
        if (proceed === 'No') return;
    }

    const nftItemAmount = toNano('0.05');
    const gasSafety = toNano('0.02');
    const totalValue = mintPrice + nftItemAmount + gasSafety; // Exact cost
    // Add a little excess to test refund
    const valueToSend = totalValue + toNano('0.5'); 

    console.log(`\nSending Mint Request...`);
    console.log(`Value Sent: ${fromNano(valueToSend)} TON (Price: ${fromNano(mintPrice)} + Storage: ${fromNano(nftItemAmount)} + Gas + Refund)`);

    await nftCollection.sendMint(provider.sender(), {
        index: collectionData.nextItemIndex,
        value: valueToSend,
        queryId: Date.now(),
        coinsForStorage: nftItemAmount, // This field name in wrapper is a bit misleading, it's just passed to body but contract logic uses msg_value mostly for payment check
        ownerAddress: provider.sender().address as Address,
        content: '/nft.json',
    });

    console.log('✅ Mint transaction sent.');
    console.log('   - Check your wallet for the "Excess refunded" message.');
    console.log('   - Check the collection for the new item.');
}

