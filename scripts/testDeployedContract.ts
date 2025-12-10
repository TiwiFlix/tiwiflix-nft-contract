import { Address, toNano, fromNano } from '@ton/core';
import { NftCollection } from '../wrappers/NftCollection';
import { NetworkProvider, sleep } from '@ton/blueprint';

export async function run(provider: NetworkProvider, args: string[]) {
    const ui = provider.ui();

    const addressStr = args.length > 0 ? args[0] : await ui.input('Collection address');
    const address = Address.parse(addressStr);
    const nftCollection = provider.open(NftCollection.createFromAddress(address));

    console.log('---------------------------------------------------------');
    console.log('🔍 Testing Deployed Contract Functions');
    console.log('Collection Address:', address.toString());
    console.log('---------------------------------------------------------');

    // 1. Get Collection Data
    console.log('\n[1/6] Fetching Collection Data...');
    try {
        const data = await nftCollection.getCollectionData();
        console.log('✅ Success!');
        console.log('   - Owner:', data.ownerAddress.toString());
        console.log('   - Next Item Index:', data.nextItemIndex);
        console.log('   - Content URI:', data.collectionContentUrl);
    } catch (e) {
        console.error('❌ Failed:', e);
    }

    // 2. Get Mint Price
    console.log('\n[2/6] Fetching Mint Price...');
    try {
        const price = await nftCollection.getMintingPrice();
        console.log('✅ Success! Mint Price:', fromNano(price), 'TON');
    } catch (e) {
        console.error('❌ Failed:', e);
    }

    // 3. Get Royalty Params
    console.log('\n[3/6] Fetching Royalty Params...');
    try {
        const royalty = await nftCollection.getRoyaltyParams();
        console.log('✅ Success!');
        console.log(`   - Factor: ${royalty.factor}, Base: ${royalty.base} (${(royalty.factor/royalty.base)*100}%)`);
        console.log('   - Recipient:', royalty.address.toString());
    } catch (e) {
        console.error('❌ Failed:', e);
    }

    // 4. Update Mint Price (requires interaction)
    const updatePrice = await ui.choose('Do you want to test updating Mint Price?', ['Yes', 'No'], (c) => c);
    if (updatePrice === 'Yes') {
        const newPriceStr = await ui.input('Enter new price (TON):');
        console.log(`\n[4/6] Updating Mint Price to ${newPriceStr} TON...`);
        try {
            await nftCollection.sendChangeMintPrice(provider.sender(), {
                value: toNano('0.02'),
                queryId: Date.now(),
                newMintPrice: Number(toNano(newPriceStr)) // Use float/number for wrapper
            });
            console.log('⏳ Transaction sent. Waiting for confirmation...');
            // Simple wait (real confirmation is hard without indexer)
            await sleep(15000); 
            const newPrice = await nftCollection.getMintingPrice();
            if (newPrice === toNano(newPriceStr)) {
                 console.log('✅ Verified! New Price:', fromNano(newPrice));
            } else {
                 console.log('⚠️ Price update might still be processing. Current:', fromNano(newPrice));
            }
        } catch (e) {
            console.error('❌ Failed:', e);
        }
    } else {
        console.log('\n[4/6] Skipped Mint Price Update.');
    }

    // 5. Emergency Withdraw (requires interaction)
    const doWithdraw = await ui.choose('Do you want to test Emergency Withdraw?', ['Yes', 'No'], (c) => c);
    if (doWithdraw === 'Yes') {
        console.log('\n[5/6] Sending Emergency Withdraw...');
        try {
            await nftCollection.sendEmergencyWithdraw(provider.sender(), {
                value: toNano('0.05'),
                queryId: Date.now()
            });
            console.log('✅ Transaction sent successfully. Check owner wallet for funds.');
        } catch (e) {
            console.error('❌ Failed:', e);
        }
    } else {
        console.log('\n[5/6] Skipped Emergency Withdraw.');
    }

    // 6. Max Supply Check
    console.log('\n[6/6] Fetching Max Supply...');
    try {
        const maxSupply = await nftCollection.getMaxSupply();
        console.log('✅ Success! Max Supply:', maxSupply.toString());
    } catch (e) {
        console.error('❌ Failed (Contract might be V1?):', e);
    }

    // 7. Get Collection Balance
    console.log('\n[7/7] Fetching Collection Balance...');
    try {
        const balance = await nftCollection.getCollectionBalance();
        console.log('✅ Success! Balance:', fromNano(balance), 'TON');
    } catch (e) {
        console.error('❌ Failed:', e);
    }

    console.log('\n---------------------------------------------------------');
    console.log('🏁 Tests Completed');
    console.log('---------------------------------------------------------');
}

