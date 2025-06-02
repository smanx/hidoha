const fs = require('fs');
const tlds = ['.loc.cc', '.hidns.vip', '.hidns.co'];
const csvFilePath = 'output.csv';
const concurrencyLimit = 100;

function checkUrl(tld) {
    if (tld.startsWith('.hidns')) {
        return 'https://www.hidoha.net/index.php?_url=/api/guest/servicedomain/check'
    } else if (tld.startsWith('.loc.cc')) {
        return 'https://free.nodeloc.com/index.php?_url=/api/guest/servicedomain/check'
    } else {
        // 抛出异常
        throw new Error('未知的 TLD 类型');
    }
}

// 读取 CSV 文件并转换为对象
function readCsvFile() {
    if (!fs.existsSync(csvFilePath)) {
        return {};
    }
    const csvData = fs.readFileSync(csvFilePath, 'utf8');
    const lines = csvData.trim().split('\n');
    const headers = lines[0].split(',');
    const result = {};
    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',');
        const sld = cleanValue(values[0]);
        const tld = cleanValue(values[1]);
        const key = `${sld}${tld}`;
        result[key] = {
            sld,
            tld,
            status: cleanValue(values[2]),
            message: cleanValue(values[3])
        };
    }
    return result;
}

// 去除字符串首尾的 " 号
function removeQuotes(str) {
    return str.replace(/^"|"$/g, '');
}

// 清理值，确保是字符串类型并去除首尾 " 号
function cleanValue(value) {
    const strValue = String(value);
    return removeQuotes(strValue.trim());
}

// 将对象转换为 CSV 数据
function convertToCsv(data) {
    let csvContent = 'sld,tld,status,message\n';
    Object.values(data).forEach(item => {
        // 确保所有属性都是字符串类型并清理
        const sld = cleanValue(item.sld);
        const tld = cleanValue(item.tld);
        const status = cleanValue(item.status);
        const message = cleanValue(item.message);

        csvContent += `"${sld}","${tld}","${status}","${message}"\n`;
    });
    return csvContent;
}

main(concurrencyLimit) // 默认并发数量为 5

async function main(concurrencyLimit = 5) {
    // 读取CSV文件
    const existingData = readCsvFile();
    // 初始化任务数组
    const tasks = [];
    // 初始化活动任务计数器
    let activeTasks = 0;
    // 初始化任务索引
    let taskIndex = 0;

    for (const tld of tlds) {
        let slds = generateConsecutiveStrings(2)
            .concat(generateConsecutiveStrings(3))
            .concat(generateConsecutiveStrings(4))
            .concat((await readWordsFile()));

        for (const sld of slds) {
            const currentTaskIndex = taskIndex++;
            const task = (async () => {
                await new Promise(resolve => {
                    const checkAndRun = () => {
                        if (activeTasks < concurrencyLimit) {
                            activeTasks++;
                            resolve();
                        } else {
                            setTimeout(checkAndRun, 100); // 等待100ms后重试
                        }
                    };
                    checkAndRun();
                });

                try {
                    const result = await check(sld, tld);
                    const key = `${sld}${tld}`;
                    if (result.error) {
                        const status = '❌';
                        const message = result.error.message;
                        existingData[key] = { sld, tld, status, message };
                        const unavailableMsg = `${currentTaskIndex}:域名不可❌ ${sld} ${tld} ${message}`;
                        console.log(unavailableMsg);
                    } else {
                        const status = '✅';
                        const message = result.result;
                        existingData[key] = { sld, tld, status, message };
                        const availableMsg = `${currentTaskIndex}:域名可用✅ ${sld} ${tld} ${message}`;
                        console.log(availableMsg);
                    }
                } catch (error) {
                    const key = `${sld}${tld}`;
                    existingData[key] = { sld, tld, status: '❌', message: error.message };
                    console.error(`${currentTaskIndex}:检查域名 ${sld}${tld} 时发生错误: ${error.message}`);
                } finally {
                    activeTasks--;
                    const csvData = convertToCsv(existingData);
                    fs.writeFileSync(csvFilePath, csvData);
                }
            })();
            tasks.push(task);
        }
    }
    await Promise.allSettled(tasks);
    console.log('所有域名检查完成。');
}

async function readWordsFile() {
    return new Promise((resolve, reject) => {
        fs.readFile('words.json', 'utf8', (err, data) => {
            if (err) {
                reject(err);
            } else {
                try {
                    const jsonData = JSON.parse(data);
                    resolve(jsonData);
                } catch (parseError) {
                    reject(parseError);
                }
            }
        });
    });
}



async function check(sld, tld) {
    const result = [];
    let url = checkUrl(tld);
    let data = await fetch(url, {
        "body": JSON.stringify({ sld, tld }),
        "method": "POST"
    }).then(res => res.json().catch(() => ({ error: res })));
    return data
}



function generateConsecutiveStrings(x) {
    const result = [];

    // 生成连续相同数字的字符串
    for (let i = 0; i <= 9; i++) {
        result.push(String(i).repeat(x));
    }

    // 生成连续相同小写字母的字符串
    for (let i = 0; i < 26; i++) {
        const char = String.fromCharCode(97 + i); // 97 是 'a' 的 ASCII 码
        result.push(char.repeat(x));
    }

    return result;
}
