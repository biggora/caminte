/**
 * Created by Alex on 12/27/2015.
 */
module.exports.categories = [
    {
        active: 0,
        category_id: 0,
        language: 'ru',
        title: 'My Category 1',
        section: 'my-category'
    },
    {
        active: 0,
        category_id: 1,
        language: 'en',
        title: 'My Category 2',
        section: 'my-category-2'
    },
    {
        active: 0,
        category_id: 1,
        language: 'lv',
        title: 'My Category 3',
        section: 'my-category-3'
    },
    {
        active: 0,
        category_id: 2,
        language: 'ru',
        title: 'My Category 4',
        section: 'my-category-4'
    },
    {
        active: 0,
        category_id: 2,
        language: 'ru',
        title: 'My Category 5',
        section: 'my-category-5'
    },
    {
        active: 0,
        category_id: 2,
        language: 'lv',
        title: 'My Category 6',
        section: 'my-category-6'
    },
    {
        active: 0,
        category_id: 3,
        language: 'es',
        title: 'My Category 7',
        section: 'my-category-7'
    }
];

module.exports.articles = [
    {
        active: 0,
        language: 'en',
        category_id: 0,
        title: 'My Article 1',
        alias: 'my-article-1',
        mainpage: 0,
        params: {
            title: 1,
            categories: 1
        }
    },
    {
        active: 0,
        language: 'en',
        category_id: 1,
        title: 'My Article 2',
        alias: 'my-article-2',
        mainpage: 0,
        params: {
            title: 1,
            categories: 1
        },
        content_short: 'Application developer focusing on web, mobile and server platforms. Always aiming to use software engineering’s best practices, like testability and design patterns, in a system’s implementation to achieve flexibility and scalability.',
        content_full: 'Application developer focusing on web, mobile and server platforms. Always aiming to use software engineering’s best practices, like testability and design patterns, in a system’s implementation to achieve flexibility and scalability.',
        meta_keys: ['app', 'developer', 'web'],
        longitude: 56.9496490,
        latitude: 24.1051860,
        price: 23.56
    },
    {
        active: 0,
        language: 'en',
        category_id: 1,
        title: 'My Article 3',
        alias: 'my-article-3',
        mainpage: 0,
        params: {
            title: 1,
            categories: 1
        }
    },
    {
        active: 0,
        language: 'en',
        category_id: 1,
        title: 'My Article-4',
        alias: 'my-article-4',
        mainpage: 0,
        params: {
            title: 1,
            categories: 1
        }
    },
    {
        active: 0,
        language: 'en',
        category_id: 1,
        title: 'My Article-5',
        alias: 'my-article-5',
        mainpage: 0,
        params: {
            title: 1,
            categories: 1
        }
    }
];

module.exports.users = [
    {
        language: 'en',
        first_name: 'Alex',
        last_name: 'Gordan',
        screen_name: 'alex',
        email: 'bubles@example.com',
        password: 'aaaaaaaaaa',
        age: 45
    },
    {
        language: 'en',
        first_name: 'Marco',
        last_name: 'Polo',
        screen_name: 'polo',
        email: 'polo@example.com',
        password: 'xxxxxxxxxx',
        age: 95
    },
    {
        language: 'en',
        first_name: 'Nataly',
        last_name: 'Prier',
        screen_name: 'nataly',
        email: 'nataly@example.com',
        password: 'nnnnnnnnnn',
        age: 21
    }
];
