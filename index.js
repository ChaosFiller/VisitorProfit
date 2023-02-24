import  axios  from '../axios'
import  Lore  from "../Lore"

const queueNotificationSound = new Sound({ source: "normal.ogg" })
const ONE_MINUTES = 60
const TEN_MINUTES = ONE_MINUTES * 10
const FARMING_WISDOM = 60
const COIN_PER_XP = 1

const desiredItemDictionary = JSON.parse(FileLib.read("VisitorProfit", "potentialItems.json"))

// Gets initial bazaar prices for all desired items
getBazaarPrice()

// Updates tooltip on hover if correct menu item
register("ItemTooltip", renderCopperProfits)

// Continually updates bazaar prices for desired items every ten minutes
register("step", getBazaarPrice).setDelay(TEN_MINUTES)

// Prevents spam-reading of item lore while hovering
let lastSentLoreLine = ""
register("guiClosed", () => {
    lastSentLoreLine = ""
})

// Checks if queue is full from tab every minute, notifies in chat if it is
register("step", () => {
    let queueTabLine = TabList.getNames().find((entry) => (entry.includes("Queue Full!")))
    if (queueTabLine) {
        queueNotificationSound.play()
        ChatLib.chat("§c§lQueue Full!")
    }
}).setDelay(ONE_MINUTES)

// Tells price of copper via command
register("command", () => {
    ChatLib.chat(`§2[VisitorProfit] §c1 Copper§7 is currently worth §6${desiredItemDictionary["Copper"][1]} coins§7.`)
    ChatLib.chat(`§2[VisitorProfit] §7Note: Price is calculated off Sunder V sell offers.`)
}).setName("cfratio")

/**
 * Gathers information about each desired item
 *
 * @param string - The line of lore that has the desired item
 * @returns {{quantity: string, name: string, colorCode: string}} - Information about the desired item
 */
function desireInformation(string) {
    const qtyRegex = /x[0-9]+/

    const desiredItem = {
        "colorCode": "§4",
        "name": "Invalid item",
        "quantity": "1"
    }

    // Gets rid of the comma when there's more than 1k items needed
    string = string.replace(",", "");

    const foundQty = string.match(qtyRegex)

    // Gets only the name and color of the item
    const itemNameWithColor = string.slice(string.indexOf(" ") + 1, string.lastIndexOf(" "))

    desiredItem.quantity = foundQty[0].slice(1)
    desiredItem.name = itemNameWithColor.slice(2)
    desiredItem.colorCode = itemNameWithColor.slice(0, 2)

    return desiredItem;
}

/**
 * Rounds to a chosen decimal place instead of to a whole number
 *
 * @param number - Number to round
 * @param digits - How many decimal places to round to
 * @returns {number} - The rounded number
 */
function betterRound(number, digits) {
    const decimalPlaces = 10 ** digits
    return Math.round(number * decimalPlaces) / decimalPlaces
}

/**
 * Formats a number to a price using format characters (k, m, B)
 *
 * @param num - The number to format
 * @param digits - Number of decimal places
 * @returns {string} - The formatted number
 */
function formatNumberAsPrice(num, digits) {
    const formatChars = [
        { value: 1, symbol: "" },
        { value: 1e3, symbol: "k" },
        { value: 1e6, symbol: "m" },
        { value: 1e9, symbol: "B" }
    ]

    // Matches the decimal and everything after it
    const decimalRegex = /\.0+$|(\.[0-9]*[1-9])0+$/

    // Determines the format character to use for the number
    const item = formatChars.slice().reverse().find((item) => {
        return num >= item.value
    })

    // Returns the newly formatted number string
    return item
        ? (num / item.value).toFixed(digits).replace(decimalRegex, "$1") + item.symbol
        : "0"
}

/**
 * Converts a formatted string (k, m) to a number
 *
 * @param str - The string to convert
 * @returns {number} - The converted number
 */
function convertFormattedStringToInt(str) {
    str = str.replaceAll(",", "").toLowerCase();

    if (str.endsWith('k'))
        return parseInt(str.slice(0, -1)) * 1000;
    else if (str.endsWith('m'))
        return parseInt(str.slice(0, -1)) * 1000000;
    else
        return parseInt(str);
}

/**
 * Updates the JSON file with updated bazaar information
 */
function getBazaarPrice() {
    const BAZAAR_ENDPOINT = 'https://api.hypixel.net/skyblock/bazaar'

    axios.get(BAZAAR_ENDPOINT).then((response) => {
        const productsObject = response.data.products
        const itemNamesInDictionary = Object.keys(desiredItemDictionary)

        itemNamesInDictionary.forEach((item) => {
            // console.log("woof")
            let itemInfo = desiredItemDictionary[item]
            let itemID = itemInfo[0]
            let itemPrice = productsObject[itemID]?.buy_summary[0].pricePerUnit
            // let productID = productsObject[itemID]?.product_id
            itemInfo[1] = !itemPrice ? -1 : itemPrice
        })

        // Calculate copper revenue using Sunder books
        desiredItemDictionary["Copper"][1] = betterRound(desiredItemDictionary["Sunder 5"][1] / 16 / 10, 1)

        // Calculates farming revenue if you get a coin per XP (scaling with wisdom)
        desiredItemDictionary["Farming XP"][1] = COIN_PER_XP * (1 + FARMING_WISDOM / 100)

        console.log(">> Updated Bazaar Prices. <<")

        FileLib.write("VisitorProfit", "potentialItems.json", JSON.stringify(desiredItemDictionary))
    })
}

/**
 * Gets the amount of rewards for a specific reward type
 *
 * @param rewardsArray - The rewards to search in
 * @param type - The type of reward to search for
 * @returns {number} - The amount of the reward
 */
function parseRewardInt(rewardsArray, type) {
    // Reward lore that matches the type
    const rewardLore = rewardsArray.find((lore) => { return lore.includes(type) } )

    // Gets the amount rewarded and the type that's rewarded
    const rewardStr = rewardLore ? rewardLore.slice(rewardLore.indexOf("+") + 3) : `0 ${type}`

    // Gets the integer value of amount rewarded
    return convertFormattedStringToInt(rewardStr.slice(0, rewardStr.indexOf(" ")))
}

/**
 * Finds the desires and rewards a visitor is offering
 *
 * @param lore - The offer's lore
 * @returns {{desires: *[], rewards: *[]}} - An object storing arrays of desires and rewards
 */
function findNPCDesireAndReward(lore) {
    const npcDesireAndReward = {
        "desires": [],
        "rewards": []
    }

    let endDesiresLineNumber = 4
    const rewardsArray = []

    // Gathers offer item names
    for (let i=2; i<lore.length; i++) {
        if (lore[i].slice(4).trim() === "") break

        let desiredItem = desireInformation(lore[i])

        npcDesireAndReward.desires.push(desiredItem)
        endDesiresLineNumber++
    }

    // Gathers rewards
    for (let i=endDesiresLineNumber; i<lore.length; i++) {
        if (lore[i].slice(4).trim() === "") break

        rewardsArray.push(lore[i])
    }

    npcDesireAndReward.rewards.push({
        "name": "Copper",
        "quantity": parseRewardInt(rewardsArray, "Copper"),
        "colorCode": "§c"
    })
    npcDesireAndReward.rewards.push({
        "name": "Farming XP",
        "quantity": parseRewardInt(rewardsArray, "§7Farming XP"),
        "colorCode": "§3"
    })

    return npcDesireAndReward
}

/**
 * Creates the lore to add on to the original lore
 *
 * @param desireArray - All desires of the offer
 * @param rewardArray - All rewards of the offer
 * @returns {string[]} - The new lines of lore
 */
function constructLoreAppend(desireArray, rewardArray) {
    const loreArray = []
    const divider = `§8§m${" ".repeat(44)}`
    let profit = 0

    loreArray.push(divider)

    // Adds desires and their costs to the lore
    desireArray.forEach((desire) => {
        let cost = desiredItemDictionary[desire.name][1] * desire.quantity
        profit -= cost
        loreArray.push(` ${desire.colorCode}${desire.name}§7: §c-${formatNumberAsPrice(cost, 2)}`)
    })

    loreArray.push(divider)

    // Adds rewards and their revenue to the lore
    rewardArray.forEach((reward) => {
        let revenue = desiredItemDictionary[reward.name][1] * reward.quantity
        profit += revenue
        loreArray.push(` ${reward.colorCode}${reward.name}§7: §a+${formatNumberAsPrice(revenue, 2)}`)
    })

    loreArray.push(divider)

    const profitColorCode = (profit > 0) ? "§a+" : "§c-"
    profit = (profit > 0) ? profit : -1 * profit
    loreArray.push(` §6Profit: ${profitColorCode}${formatNumberAsPrice(profit, 2)}`)
    loreArray.push(divider)

    return loreArray
}

/**
 * Renders profit, revenue, and cost information on the original lore
 *
 * @param lore - The original lore
 * @param item - The item to attach the new lore to
 */
function renderCopperProfits(lore, item) {
    // Returns if not hovering over offer
    if (!lore[0].includes("Accept Offer")) return

    // Returns if already rendering lore
    if (lastSentLoreLine === lore[2]) return
    lastSentLoreLine = lore[2]

    const npcDesireAndReward = findNPCDesireAndReward(lore)

    const desireArray = npcDesireAndReward.desires
    const rewardArray = npcDesireAndReward.rewards
    const loreArray = constructLoreAppend(desireArray, rewardArray)

    loreArray.forEach((line) => {
        Lore.append(item, line)
    })
}