<?php

return [
    'public_key' => 'andenne-bears-feedback',
    'allowed_origins' => [
        'https://andenne-bears.be',
        'https://www.andenne-bears.be',
        'https://mathieuluyten.be',
    ],
    'github' => [
        'owner' => 'MLyte',
        'repo' => 'andenne-bears.be',
        'token' => getenv('GITHUB_ISSUES_TOKEN') ?: '',
        'labels' => [
            'source:client-feedback',
            'status:raw',
            'type:feedback',
        ],
    ],
];
