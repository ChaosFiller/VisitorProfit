import  axios  from '../axios'
import  Lore  from "../Lore"

const queueNotificationSound = new Sound({ source: "normal.ogg" })
const ONE_MINUTES = 60
const TEN_MINUTES = ONE_MINUTES * 10
const FARMING_WISDOM = 60
const COIN_PER_XP = 1

function desireInformation(string) {
    string = string.replace(",", "")
    const regex = /x[0-9]+/
    let found = ""
    if (string.match(regex) == undefined) {
        found = ["x1"]
        string = string + " §8x1"
    } else {
        found = string.match(regex)
    }
    const quantity = found[0].slice(1)
    const itemNameWithColor = string.slice(5, -3 + -1 * found[0].length)
    const itemName = itemNameWithColor.slice(2)
    const colorCode = itemNameWithColor.slice(0, 2)

    const itemInformation = {
        "colorCode": colorCode,
        "name": itemName,
        "quantity": quantity
    }

    return itemInformation
}

function betterRound(number, digits) {
    let decimalPlaces = 10 ** digits
    return Math.round(number * decimalPlaces) / decimalPlaces
}

function formatNumberAsPrice(num, digits) {
    const lookup = [
      { value: 1, symbol: "" },
      { value: 1e3, symbol: "k" },
      { value: 1e6, symbol: "m" },
      { value: 1e9, symbol: "B" }
    ]
    const rx = /\.0+$|(\.[0-9]*[1-9])0+$/
    var item = lookup.slice().reverse().find(function(item) {
      return num >= item.value
    })
    return item ? (num / item.value).toFixed(digits).replace(rx, "$1") + item.symbol : "0"
}

function convertFormattedStringToInt(str) {
    // Remove any commas in the string and convert to lowercase
    str = str.replace(/,/g, '').toLowerCase();
  
    // Check if the string ends with 'k' or 'm'
    if (str.endsWith('k')) {
      // Remove the 'k' and multiply the number by 1000
      return parseInt(str.slice(0, -1)) * 1000;
    } else if (str.endsWith('m')) {
      // Remove the 'm' and multiply the number by 1000000
      return parseInt(str.slice(0, -1)) * 1000000;
    } else {
      // If the string doesn't end with 'k' or 'm', parse the integer directly
      return parseInt(str);
    }
  }

let desiredItemDictionary = JSON.parse(FileLib.read("VisitorProfit", "potentialItems.json"))

function getBazaarPrice() {
    const BAZAAR_ENDPOINT = 'https://api.hypixel.net/skyblock/bazaar'
    axios.get(BAZAAR_ENDPOINT).then((response) => {
        const productsObject = response.data.products
        const itemNamesInDictionary = Object.keys(desiredItemDictionary)
        itemNamesInDictionary.forEach((key) => {
            let itemDataInDictionary = desiredItemDictionary[key]
            let itemID = itemDataInDictionary[0]
            let itemPrice = (productsObject[itemID] == undefined) ? undefined : productsObject[itemID].buy_summary[0].pricePerUnit
            desiredItemDictionary[key][1] = (itemPrice == undefined) ? -1 : itemPrice
        })
        desiredItemDictionary["Copper"][1] = betterRound(desiredItemDictionary["Sunder 5"][1] / 16 / 10, 1)
        desiredItemDictionary["Farming XP"][1] = COIN_PER_XP * (1 + FARMING_WISDOM / 100)
        FileLib.write("VisitorProfit", "potentialItems.json", JSON.stringify(desiredItemDictionary))
    })
}

// TooltipRendrer
register("ItemTooltip", renderCopperProfits)

getBazaarPrice()
register("step", getBazaarPrice).setDelay(TEN_MINUTES)

function parseRewardInt(rewardsArray, type) {
    let loreLine = rewardsArray.find((lore) => ( lore.includes(type) ))
    let rewardStr = (loreLine) ? rewardStr = loreLine.slice(10) : `0 ${type}`
    let rewardInt = convertFormattedStringToInt(rewardStr.slice(0, -1 * (type.length + 1)))

    return rewardInt
}

function findNPCDesireAndReward(lore) {
    let npcDesireAndReward = {
        "desire": [],
        "award": []
    }

    let endOfRequestLineNumber = 4

    // finds the item names
    for (i = 2; i < lore.length; i++) {
        if (lore[i].slice(4).trim() == "") { break }
        let desiredItem = desireInformation(lore[i])
        npcDesireAndReward.desire.push(desiredItem)
        endOfRequestLineNumber++
    }

    let rewardsArray = []
    for (i = endOfRequestLineNumber; i < lore.length; i++) {
        if (lore[i].slice(4).trim() == "") { break }
        rewardsArray.push(lore[i])
    }

    npcDesireAndReward.award.push({
        "name": "Copper",
        "quantity": parseRewardInt(rewardsArray, "Copper"),
        "colorCode": "§c"
    })
    npcDesireAndReward.award.push({
        "name": "Farming XP",
        "quantity": parseRewardInt(rewardsArray, "§7Farming XP"),
        "colorCode": "§3"
    })

    return npcDesireAndReward
}

function constructLoreAppend(desireArray, rewardArray) {
    let loreArray = []
    let netProfit = 0
    let spaces = " ".repeat(44)
    let divider = `§8§m${spaces}`

    loreArray.push(divider)
    desireArray.forEach((itemInfo) => {
        let cost = desiredItemDictionary[itemInfo.name][1] * itemInfo.quantity
        netProfit -= cost
        loreArray.push(` ${itemInfo.colorCode}${itemInfo.name}§7: §c-${formatNumberAsPrice(cost, 2)}`)
    })
    loreArray.push(divider)
    rewardArray.forEach((reward) => {
        let profit = desiredItemDictionary[reward.name][1] * reward.quantity
        netProfit += profit
        loreArray.push(` ${reward.colorCode}${reward.name}§7: §a+${formatNumberAsPrice(profit, 2)}`)
    })
    loreArray.push(divider)

    let netProfitColorCode = (netProfit > 0) ? "§a+" : "§c-"
    netProfit = (netProfit > 0) ? netProfit : -1 * netProfit
    loreArray.push(` §6Profit: ${netProfitColorCode}${formatNumberAsPrice(netProfit, 2)}`)
    loreArray.push(divider)

    return loreArray
}

function renderCopperProfits(lore, item, event) {
    if (lore[0] == undefined) { return }
    if (!lore[0].includes("Accept Offer")) { return }
    if (lore.indexOf(`§5§o§8§m${" ".repeat(44)}`) != -1) { return }

    let npcDesireAndReward = findNPCDesireAndReward(lore)

    let desireArray = npcDesireAndReward.desire
    let rewardArray = npcDesireAndReward.award
    let loreArray = constructLoreAppend(desireArray, rewardArray)
    
    loreArray.forEach((loreLine) => {
        Lore.append(item, loreLine)
    })
}



register("command", () => {
    ChatLib.chat(`§2[VisitorProfit] §c1 Copper§7 is currently worth §6${desiredItemDictionary["Copper"][1]} coins§7.`)
    ChatLib.chat(`§2[VisitorProfit] §7Note: Price is calculated off Sunder V sell offers.`)
}).setName("vpratio")

let queueNotificationEnable = true
register("command", () => {
    if (queueNotificationEnable) {
        ChatLib.chat(`§2[VisitorProfit] §7Queue notifications are now §cOFF§7.`)
        queueNotificationEnable = false
    } else {
        ChatLib.chat(`§2[VisitorProfit] §7Queue notifications are now §aON§7.`)
        queueNotificationEnable = true  
    }
}).setName("vpqueuesound")

register("step", () => {
    let queueTabLine = TabList.getNames().find((entry) => (entry.includes("Queue Full!")))
    if (queueTabLine != undefined && queueNotificationEnable) { 
        queueNotificationSound.play()
        ChatLib.chat("§c§lQueue Full!")
    }
}).setDelay(ONE_MINUTES)