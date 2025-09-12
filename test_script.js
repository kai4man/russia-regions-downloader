const { processRegion } = require('./download_russia_regions');

// Тестируем скрипт на одном регионе
async function testScript() {
    console.log('Тестирование скрипта на регионе "Москва"...');
    
    try {
        const result = await processRegion('Москва');
        
        if (result) {
            console.log('\n=== Результат теста ===');
            console.log(`Регион: ${result.name}`);
            console.log(`OSM ID: ${result.osm_id}`);
            console.log(`Центр: [${result.center[0]}, ${result.center[1]}]`);
            console.log(`Количество МО: ${result.municipalities.length}`);
            
            if (result.municipalities.length > 0) {
                console.log('\nПервое МО:');
                const firstMO = result.municipalities[0];
                console.log(`  Название: ${firstMO.name}`);
                console.log(`  Уровень: ${firstMO.admin_level}`);
                console.log(`  Центр: [${firstMO.center[0]}, ${firstMO.center[1]}]`);
                console.log(`  Тип границ: ${firstMO.boundaries.type}`);
                console.log(`  Количество координат: ${firstMO.boundaries.coordinates[0].length}`);
            }
            
            console.log('\n✅ Тест прошел успешно!');
        } else {
            console.log('❌ Тест не прошел - не удалось получить данные');
        }
    } catch (error) {
        console.error('❌ Ошибка при тестировании:', error.message);
    }
}

// Запуск теста
if (require.main === module) {
    testScript();
}

module.exports = { testScript };
